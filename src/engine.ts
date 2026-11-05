import { SwarmAudio } from './audio';
import { backgroundColor, visibleBounds } from './bounds';
import { clamp, ease, finite, stepSpring } from './math';
import { cursorMarkup, NAMES, PALETTE, styles } from './presentation';
import { snapshot, type Layer } from './snapshot';
import type { SwarmController, SwarmOptions, SwarmPhase, SwarmState } from './types';

interface Worker {
  node: HTMLDivElement; selection: HTMLDivElement; badge: HTMLSpanElement;
  x: number; y: number; vx: number; vy: number;
  fromX: number; fromY: number; elapsed: number; duration: number;
  task?: Layer; color: string;
}
export const initialState = (options: SwarmOptions = {}): SwarmState => ({ phase: 'idle', completed: 0, total: 0, progress: 0, agents: 0, speed: finite(options.speed, 1, .25, 8), sound: options.sound ?? false, tour: options.tour ?? false });

/** Create an imperative instance. Safe to import during SSR; call in the browser. */
export function createSwarmRebuild(options: SwarmOptions = {}): SwarmController {
  let state = initialState(options);
  let host: HTMLDivElement | undefined, shadow: ShadowRoot | undefined;
  let cover: HTMLDivElement, stage: HTMLDivElement, workersRoot: HTMLDivElement, intro: HTMLDivElement;
  let status: HTMLSpanElement, progress: HTMLDivElement, help: HTMLDivElement;
  let workers: Worker[] = [], layers: Layer[] = [];
  let frame = 0, last = 0, elapsed = 0, lastEmit = 0, generation = 0;
  let destroyed = false, active = false, previousFocus: HTMLElement | null = null;
  let savedPhase: SwarmPhase = 'building';
  let pointer = { x: 0, y: 0 }, cleanup: (() => void)[] = [];
  let viewportWidth = 0, viewportHeight = 0;
  let target: HTMLElement, scoped = false, ready = options.ready !== false;
  let bounds: DOMRect, capturedBounds: DOMRect | undefined;
  let snapshotTaken = false;
  const audio = new SwarmAudio();
  const getState = () => ({ ...state });
  const emit = () => {
    if (host) host.dataset.swarmPhase = state.phase;
    updateToolbar(); options.onStateChange?.(getState());
  };
  const listen = (target: EventTarget, name: string, handler: EventListener, settings?: AddEventListenerOptions) => {
    target.addEventListener(name, handler, settings);
    cleanup.push(() => target.removeEventListener(name, handler, settings));
  };
  const element = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent?: Node) => {
    const node = document.createElement(tag); node.className = className; parent?.appendChild(node); return node;
  };
  function setPhase(phase: SwarmPhase) { state.phase = phase; emit(); }
  function updateToolbar() {
    if (!shadow) return;
    if (status) status.textContent = state.phase === 'scanning' ? 'Scanning page…' : state.phase === 'intro' ? ready ? 'Gathering the swarm…' : 'Preparing content…' : state.phase === 'complete' ? 'Built. Move your mouse.' : `${state.completed} / ${state.total} layers`;
    if (progress) progress.style.width = `${state.progress * 100}%`;
    const update = (action: string, text: string, pressed?: boolean) => {
      const button = shadow!.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
      if (button) { button.textContent = text; if (pressed !== undefined) button.setAttribute('aria-pressed', String(pressed)); }
    };
    update('speed', `${state.speed}×`);
    update('sound', state.sound ? '♪ On' : '♪ Off', state.sound);
    update('tour', 'Tour', state.tour);
    update('pause', state.phase === 'paused' ? 'Resume' : 'Pause', state.phase === 'paused');
    if (help) help.textContent = state.phase === 'complete' ? 'Move your mouse · Go live to use the page' : 'Scroll to build more · Esc to exit';
  }
  function dispose() {
    const restoreFocus = !!shadow?.activeElement;
    active = false;
    generation++;
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
    cleanup.splice(0).forEach(fn => fn());
    host?.remove(); host = undefined; shadow = undefined;
    workers = []; layers = [];
    audio.setEnabled(false);
    if (restoreFocus && previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    previousFocus = null;
  }
  function stop() { dispose(); state.agents = 0; setPhase('idle'); }
  function goLive() { dispose(); state.agents = 0; setPhase('live'); }
  function pause() {
    if (!active || state.phase === 'paused' || state.phase === 'scanning') return;
    savedPhase = state.phase; setPhase('paused');
  }
  function resume() { if (state.phase === 'paused') { last = performance.now(); setPhase(savedPhase); } }
  function setSpeed(speed: number) { state.speed = finite(speed, state.speed, .25, 8); emit(); }
  function setSound(enabled: boolean) { state.sound = enabled; audio.setEnabled(enabled && active); emit(); }
  function setTour(enabled: boolean) { state.tour = enabled; emit(); }
  function setReady(value: boolean) { ready = value; }
  function toolbar() {
    if (options.controls === false) return;
    const minimal = options.controls === 'minimal';
    const bar = element('div', minimal ? 'toolbar minimal' : 'toolbar', shadow);
    bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Swarm rebuild controls');
    if (minimal) {
      status = element('span', 'status', bar);
      status.setAttribute('role', 'status');
      const skip = element('button', 'live', bar);
      skip.type = 'button'; skip.textContent = 'Skip animation';
      skip.setAttribute('aria-label', 'Skip animation');
      listen(skip, 'click', goLive);
      return;
    }
    const avatars = element('div', 'avatars', bar);
    PALETTE.slice(0, 5).forEach(color => { const avatar = element('span', 'avatar', avatars); avatar.style.background = color; });
    status = element('span', 'status', bar);
    status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const track = element('div', 'track', bar); progress = element('div', 'fill', track);
    element('div', 'divider', bar);
    const actions: [string, string, () => void][] = [
      ['pause', 'Pause / resume animation', () => state.phase === 'paused' ? resume() : pause()],
      ['tour', 'Toggle automatic scrolling', () => setTour(!state.tour)],
      ['speed', 'Change playback speed', () => setSpeed(state.speed >= 3 ? 1 : Math.floor(state.speed) + 1)],
      ['sound', 'Toggle sound', () => setSound(!state.sound)],
      ['replay', 'Replay animation', start],
      ['live', 'Go live', goLive],
      ['close', 'Close animation', stop],
    ];
    actions.forEach(([action, label, handler]) => {
      const button = element('button', action === 'live' ? 'live' : '', bar);
      button.type = 'button'; button.dataset.action = action;
      button.setAttribute('aria-label', label); button.title = label;
      button.textContent = ({ replay: 'Replay', live: 'Go live', close: '×' } as Record<string, string>)[action] ?? action;
      listen(button, 'click', handler);
    });
    help = element('div', 'help', shadow);
  }
  function resolveTarget(): HTMLElement {
    const target = options.target;
    const resolved = typeof target === 'string' ? document.querySelector(target) : target && 'current' in target ? target.current : target ?? document.body;
    if (!(resolved instanceof HTMLElement) || !resolved.isConnected) throw new Error('Swarm target must be a connected HTMLElement. Check your selector or ref.');
    return resolved;
  }
  function start() {
    if (destroyed) return;
    if (typeof window === 'undefined' || typeof document === 'undefined') throw new Error('Start Swarm Rebuild in a browser effect or event handler.');
    dispose();
    try { target = resolveTarget(); }
    catch (error) { setPhase('idle'); options.onError?.(error as Error); if (!options.onError) throw error; return; }
    state = { ...state, phase: 'scanning', completed: 0, total: 0, progress: 0, agents: 0 };
    if (options.respectReducedMotion !== false && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      state.progress = 1; setPhase('live'); options.onComplete?.(); return;
    }
    scoped = options.scope === 'target' || (options.scope !== 'viewport' && target !== document.body && target !== document.documentElement);
    viewportWidth = window.innerWidth; viewportHeight = window.innerHeight;
    bounds = scoped ? visibleBounds(target) : new DOMRect(0, 0, viewportWidth, viewportHeight);
    capturedBounds = undefined; snapshotTaken = false;
    pointer = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height * .46 };
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    host = document.createElement('div');
    host.setAttribute('data-swarm-overlay', '');
    host.style.cssText = `all:initial;position:fixed;inset:0;display:block;z-index:${finite(options.zIndex, 2147483000, 0, 2147483647)};isolation:isolate;`;
    host.style.pointerEvents = 'none';
    host.dataset.swarmScope = scoped ? 'target' : 'viewport';
    shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style'); style.textContent = styles; shadow.append(style);
    cover = element('div', 'cover', shadow);
    cover.style.background = options.background ?? backgroundColor(target);
    stage = element('div', 'stage', cover);
    stage.inert = true;
    stage.setAttribute('aria-hidden', 'true');
    workersRoot = element('div', 'workers', shadow);
    workersRoot.setAttribute('aria-hidden', 'true');
    intro = element('div', 'intro', shadow); intro.textContent = '↗';
    intro.setAttribute('aria-hidden', 'true');
    toolbar();
    document.documentElement.append(host);
    updateBounds();
    active = true; elapsed = 0; last = performance.now(); lastEmit = 0;
    listen(window, 'pointermove', ((event: PointerEvent) => { pointer = { x: event.clientX, y: event.clientY }; }) as EventListener, { passive: true });
    listen(window, 'keydown', ((event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); stop(); }
      if ((!scoped || shadow?.activeElement) && event.key.toLowerCase() === 'm' && !event.ctrlKey && !event.metaKey && !event.altKey) setSound(!state.sound);
      if (event.key === 'Tab' && shadow && !scoped) {
        const buttons = Array.from(shadow.querySelectorAll<HTMLButtonElement>('button'));
        if (!buttons.length) return;
        const index = buttons.indexOf(shadow.activeElement as HTMLButtonElement);
        event.preventDefault();
        buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus();
      }
    }) as EventListener);
    listen(cover, 'pointerdown', () => { if (state.sound) audio.setEnabled(true); });
    // A fresh snapshot after layout changes avoids stale geometry. Ignore mobile browser chrome height changes.
    listen(window, 'resize', () => {
      if (Math.abs(window.innerWidth - viewportWidth) > 2) { if (scoped) goLive(); else start(); }
      else viewportHeight = window.innerHeight;
    }, { passive: true });
    audio.setEnabled(state.sound);
    emit();
    if (scoped) {
      // Once geometry is captured, scrolling reveals the real UI instead of
      // animating stale positions or blocking the surrounding application.
      listen(document, 'scroll', () => { if (snapshotTaken) goLive(); }, { capture: true, passive: true });
    }
    createWorkers();
    setPhase('intro');
    frame = window.requestAnimationFrame(tick);
  }
  function updateBounds() {
    if (!host) return;
    bounds = scoped ? visibleBounds(target) : new DOMRect(0, 0, window.innerWidth, window.innerHeight);
    if (scoped) {
      host.style.clipPath = `inset(${bounds.top}px ${Math.max(0, window.innerWidth - bounds.right)}px ${Math.max(0, window.innerHeight - bounds.bottom)}px ${bounds.left}px)`;
      host.style.setProperty('--swarm-left', `${bounds.left}px`);
      host.style.setProperty('--swarm-top', `${bounds.top}px`);
      host.style.setProperty('--swarm-width', `${bounds.width}px`);
      host.style.setProperty('--swarm-height', `${bounds.height}px`);
      host.style.setProperty('--swarm-center-x', `${bounds.left + bounds.width / 2}px`);
      host.style.setProperty('--swarm-center-y', `${bounds.top + bounds.height * .46}px`);
      host.style.setProperty('--swarm-bottom', `${window.innerHeight - bounds.bottom + 16}px`);
    }
  }
  function capture() {
    try {
      const result = snapshot(target, stage, finite(options.maxLayers, 2500, 1, 10000), scoped ? bounds : undefined);
      layers = result.layers;
      state.total = layers.length;
      snapshotTaken = true; capturedBounds = bounds;
      // Selection outlines must sit above the reconstructed content.
      workers.forEach(worker => stage.append(worker.selection));
      intro.style.opacity = '0';
      const guidePositions = [...new Set(layers.filter(l => l.kind === 'text').map(l => Math.round(l.x)))].slice(0, 5);
      guidePositions.forEach(x => { const guide = element('div', 'guide', shadow); guide.style.left = `${x - window.scrollX}px`; });
      setPhase('building');
    } catch (error) {
      stop(); options.onError?.(error as Error);
      if (!options.onError) console.error('[react-swarm-rebuild]', error);
    }
  }
  function createWorkers() {
    const count = Math.floor(finite(options.cursorCount, 16, 2, 48));
    const colors = options.colors?.length ? options.colors : PALETTE;
    const names = options.names?.length ? options.names : NAMES;
    workers = Array.from({ length: count }, (_, i) => {
      const color = colors[i % colors.length];
      const node = element('div', 'worker', workersRoot);
      node.style.setProperty('--color', color);
      node.innerHTML = cursorMarkup(color);
      if (options.showNames === true) { const name = element('span', 'name', node); name.textContent = names[i % names.length]; }
      const selection = element('div', 'selection', stage);
      selection.style.setProperty('--color', color); selection.hidden = true;
      const badge = element('span', 'badge', selection);
      const angle = i / count * Math.PI * 2;
      return { node, selection, badge, color, x: bounds.left + bounds.width / 2 + Math.cos(angle) * Math.min(100, bounds.width * .25), y: bounds.top + bounds.height * .46 + Math.sin(angle) * Math.min(100, bounds.height * .25), vx: 0, vy: 0, fromX: 0, fromY: 0, elapsed: 0, duration: 1 };
    });
    state.agents = count;
    const ruler = element('div', 'ruler-x', shadow); ruler.textContent = '　 0　　　　 100　　　　 200　　　　 300　　　　 400　　　　 500　　　　 600　　　　 700　　　　 800　　　　 900';
    element('div', 'ruler-y', shadow);
  }
  function assign(worker: Worker) {
    const top = window.scrollY, bottom = top + viewportHeight;
    let best: Layer | undefined, score = Infinity;
    for (const layer of layers) {
      if (layer.done || layer.started || (layer.parent && !layer.parent.done) || (layer.master && !layer.master.done)) continue;
      if (layer.y > bottom + 80) continue;
      const priority = Math.max(0, layer.y - top) * .8 + Math.hypot(layer.x - window.scrollX - worker.x, layer.y - top - worker.y) * .2;
      if (priority < score) { best = layer; score = priority; }
    }
    if (!best) return;
    best.started = true; worker.task = best; worker.elapsed = 0;
    worker.fromX = worker.x; worker.fromY = worker.y;
    const textLength = best.text?.reduce((n, run) => n + run.value.length, 0) ?? 0;
    worker.duration = best.kind === 'text' ? clamp(textLength * .018, .45, 2.4) : .5 + Math.min(1, (best.width + best.height) / 1000);
    worker.node.dataset.tool = best.master ? 'duplicate' : 'arrow';
    const arrow = worker.node.querySelector<SVGElement>('.pointer');
    if (arrow) arrow.style.transform = '';
    worker.selection.style.borderStyle = best.master ? 'dashed' : 'solid';
    if (best.master) {
      const measure = element('span', 'measure', worker.selection);
      measure.textContent = `⌥ ${Math.round(Math.hypot(best.x - best.master.x, best.y - best.master.y))}`;
    }
  }
  function work(worker: Worker, dt: number) {
    const task = worker.task!;
    worker.elapsed += dt;
    const travel = .5;
    const x = task.x - window.scrollX, y = task.y - window.scrollY;
    if (worker.elapsed < travel) {
      const t = ease(worker.elapsed / travel);
      const sourceX = task.master ? task.master.x - window.scrollX : x;
      const sourceY = task.master ? task.master.y - window.scrollY : y;
      worker.x = worker.fromX + (sourceX - worker.fromX) * t;
      worker.y = worker.fromY + (sourceY - worker.fromY) * t;
      return;
    }
    const t = clamp((worker.elapsed - travel) / worker.duration, 0, 1);
    const draw = ease(Math.min(1, t / .35));
    worker.node.dataset.tool = task.master ? 'duplicate' : task.kind === 'text' && t > .35 ? 'type' : task.kind === 'line' ? 'pen' : 'cross';
    worker.selection.hidden = false;
    const width = task.kind === 'text' ? task.width * draw : task.width * ease(t);
    const height = task.kind === 'text' ? task.height * draw : task.height * ease(t);
    const duplicateX = task.master ? (task.master.x - task.x) * (1 - ease(t)) : 0;
    const duplicateY = task.master ? (task.master.y - task.y) * (1 - ease(t)) : 0;
    worker.selection.style.left = `${task.x + duplicateX}px`; worker.selection.style.top = `${task.y + duplicateY}px`;
    worker.selection.style.width = `${Math.max(1, task.master ? task.width : width)}px`; worker.selection.style.height = `${Math.max(1, task.master ? task.height : height)}px`;
    worker.selection.style.background = task.kind === 'box' && !task.master && t < .65 ? '#a0a5ab18' : '';
    worker.badge.textContent = `${Math.round(width)} × ${Math.round(height)}`;
    worker.x = x + width; worker.y = y + height;
    task.element.style.visibility = 'visible';
    task.element.style.transform = task.master ? `translate(${duplicateX}px,${duplicateY}px)` : '';
    if (task.master) { worker.x = x + duplicateX; worker.y = y + duplicateY; }
    if (task.text) {
      const total = task.text.reduce((n, run) => n + run.value.length, 0);
      let remaining = Math.ceil(total * clamp((t - .35) / .65, 0, 1));
      task.text.forEach(run => {
        const value = run.value.slice(0, Math.max(0, remaining));
        if (run.node.textContent !== value) audio.play('type', worker.x / viewportWidth);
        run.node.textContent = value; remaining -= run.value.length;
      });
      worker.x = x + task.width * (total ? clamp((t - .35) / .65, 0, 1) : 1);
      worker.y = y + task.height * .5;
      // A visible insertion caret follows the typing cursor.
      worker.badge.textContent = 'T';
      const fontSize = parseFloat(task.text[0]?.node.style.fontSize ?? '0');
      if (fontSize >= 32) {
        const scale = Math.min(1, (18 + Math.floor(t * 5) / 5 * (fontSize - 18)) / fontSize);
        (task.element.firstElementChild as HTMLElement).style.transformOrigin = 'top left';
        (task.element.firstElementChild as HTMLElement).style.transform = `scale(${scale})`;
      }
    } else {
      const visual = task.element.firstElementChild as HTMLElement;
      visual.style.clipPath = task.master ? '' : task.kind === 'media' ? `inset(0 0 ${100 - ease(t) * 100}% 0)` : `inset(0 ${100 - ease(t) * 100}% 0 0)`;
      visual.style.opacity = String(Number(task.opacity || 1) * (.3 + .7 * ease(t)));
    }
    if (t > .02 && t < .08) audio.play('draw', worker.x / viewportWidth);
    if (t >= 1) {
      task.done = true;
      const visual = task.element.firstElementChild as HTMLElement;
      visual.style.clipPath = ''; visual.style.opacity = task.opacity; visual.style.transform = '';
      task.element.style.transform = '';
      worker.selection.hidden = true;
      worker.selection.querySelector('.measure')?.remove();
      worker.node.dataset.tool = 'arrow';
      worker.task = undefined;
      state.completed++; state.progress = state.total ? state.completed / state.total : 1;
    }
  }
  function flock(worker: Worker, index: number, dt: number, orbit: boolean) {
    const theta = index / workers.length * Math.PI * 2 + elapsed * (orbit ? 1.3 : .28);
    const radius = Math.min(orbit ? 100 + Math.sin(index * 2 + elapsed) * 15 : 55 + (index % 4) * 23, bounds.width * .3, bounds.height * .3);
    let tx = (orbit ? bounds.left + bounds.width / 2 : pointer.x) + Math.cos(theta) * radius;
    let ty = (orbit ? bounds.top + bounds.height * .46 : pointer.y) + Math.sin(theta) * radius * .7;
    for (const other of workers) {
      if (other === worker) continue;
      const dx = worker.x - other.x, dy = worker.y - other.y, d2 = dx * dx + dy * dy;
      if (d2 > 0 && d2 < 900) { tx += dx * 500 / d2; ty += dy * 500 / d2; }
    }
    const sx = stepSpring(worker.x, worker.vx, clamp(tx, bounds.left + 15, Math.max(bounds.left + 15, bounds.right - 25)), dt);
    const sy = stepSpring(worker.y, worker.vy, clamp(ty, bounds.top + 25, Math.max(bounds.top + 25, bounds.bottom - 60)), dt);
    worker.x = sx.position; worker.vx = sx.velocity; worker.y = sy.position; worker.vy = sy.velocity;
    const arrow = worker.node.querySelector<SVGElement>('.pointer');
    if (arrow) { arrow.style.transformOrigin = '3px 2.5px'; arrow.style.transform = `translate(-3px,-2.5px) rotate(${Math.atan2(worker.vy, worker.vx) * 180 / Math.PI + 135}deg)`; }
  }
  function tick(now: number) {
    if (!active) return;
    if (!target.isConnected) { stop(); return; }
    updateBounds();
    if (scoped && capturedBounds && ['left', 'top', 'width', 'height'].some(key =>
      Math.abs(bounds[key as keyof DOMRect] as number - (capturedBounds![key as keyof DOMRect] as number)) > 2)) {
      goLive(); return;
    }
    const realDt = Math.min(.05, Math.max(0, (now - last) / 1000)); last = now;
    stage.style.transform = `translate(${-window.scrollX}px,${-window.scrollY}px)`;
    if (state.phase !== 'paused') {
      const dt = realDt * state.speed; elapsed += dt;
      if (state.phase === 'intro' && ready && elapsed * 1000 >= finite(options.introDuration, 1600, 0, 15000)) {
        capture();
        if (!active) return;
      }
      workers.forEach((worker, index) => {
        if (state.phase === 'building') {
          if (!worker.task) assign(worker);
          if (worker.task) work(worker, dt); else flock(worker, index, realDt, false);
        } else flock(worker, index, realDt, state.phase === 'intro');
        worker.node.style.transform = `translate3d(${worker.x.toFixed(2)}px,${worker.y.toFixed(2)}px,0)`;
      });
      if (state.phase === 'building') {
        if (state.tour) {
          const next = layers.filter(l => !l.done).reduce((min, l) => Math.min(min, l.y), Infinity);
          if (Number.isFinite(next)) {
            const goal = Math.max(0, next - viewportHeight * .35);
            if (goal > window.scrollY + 1) window.scrollBy(0, Math.min(goal - window.scrollY, 180 * dt));
          }
        }
        if (state.completed === state.total) {
          state.progress = 1; shadow?.querySelectorAll('.guide,.ruler-x,.ruler-y').forEach(node => node.remove());
          audio.play('complete'); setPhase('complete'); options.onComplete?.();
          if (options.finishBehavior !== 'flock') { goLive(); return; }
        }
      }
      if (now - lastEmit > 150) { lastEmit = now; emit(); }
    }
    if (active) frame = window.requestAnimationFrame(tick);
  }
  return { start, replay: start, pause, resume, goLive, stop, setSpeed, setSound, setTour, setReady, getState, destroy() { dispose(); audio.destroy(); destroyed = true; state = { ...state, phase: 'idle', agents: 0 }; } };
}
