const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { build } = require('esbuild');
const { chromium } = require('playwright-core');

(async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-browser-'));
  const bundle = path.join(directory, 'bundle.js');
  await build({ stdin: { contents: `
    import { createSwarmRebuild } from './src/index';
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { SwarmRebuild } from './src/index';
    window.createSwarm = createSwarmRebuild;
    window.mountReact = () => {
      window.reactRoot = createRoot(document.getElementById('react-root'));
      const App = () => {
        const [ready, setReady] = React.useState(false);
        window.reactReady = setReady;
        return <React.StrictMode><SwarmRebuild target="#target" ready={ready} speed={8} introDuration={0} controls="minimal" /></React.StrictMode>;
      };
      window.reactRoot.render(<App />);
    };
  `, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, nodePaths: require.resolve.paths('react'), outfile: bundle, define: { 'process.env.NODE_ENV': '"development"' } });
  const html = `<!doctype html><html><head><style>
    *{box-sizing:border-box}body{margin:0;background:#f4f7fa;font:16px Arial}
    header{position:fixed;top:0;left:220px;right:0;height:72px;background:#fff;padding:20px}
    aside{position:fixed;left:0;top:0;bottom:0;width:220px;background:#153e3b;padding:24px;color:#fff}
    #scroller{position:fixed;left:220px;right:0;top:72px;bottom:48px;overflow:auto;padding:20px}
    #target{background:#fff;min-height:1400px;padding:24px}section{padding:24px;border:1px solid #dde4ea}
    footer{position:fixed;bottom:0;left:220px;right:0;height:48px;background:#fff}
    @media(max-width:600px){aside{width:64px;padding:8px}header,#scroller,footer{left:64px}#scroller{padding:8px}#target{padding:12px}}
  </style></head><body><header><button id="header-button" onclick="this.textContent='Header clicked'">Header control</button><input id="search" aria-label="Search"/><button id="next">Next</button></header><aside><button id="nav-button" onclick="this.textContent='Nav clicked'">Menu</button></aside><div id="scroller"><main id="target"><h1>Loading placeholder</h1><section>Card</section><div style="margin-top:1000px">Offscreen content</div></main></div><footer>Footer</footer><div id="react-root"></div><script src="/bundle.js"></script></body></html>`;
  const server = http.createServer((request, response) => {
    response.setHeader('Content-Type', request.url === '/bundle.js' ? 'text/javascript' : 'text/html');
    response.end(request.url === '/bundle.js' ? fs.readFileSync(bundle) : html);
  });
  let browser;
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      const overlay = page.locator('[data-swarm-overlay]');
      await page.evaluate(() => {
        window.states = [];
        window.completions = 0;
        window.swarm = window.createSwarm({ target: '#target', ready: false, introDuration: 0, speed: 8, controls: 'minimal', onStateChange: state => window.states.push(state), onComplete: () => window.completions++ });
        window.swarm.start();
        // The cover is installed synchronously, before a browser paint.
        window.entranceOpacity = document.querySelector('[data-swarm-overlay]').shadowRoot.querySelector('.workers').style.opacity;
        window.coveredImmediately = document.elementFromPoint(window.innerWidth - 40, 140)?.closest('[data-swarm-overlay]') !== null;
      });
      assert.equal(await page.evaluate(() => window.coveredImmediately), true);
      assert.equal(await page.evaluate(() => window.entranceOpacity), '0');
      await overlay.waitFor();
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(() => window.swarm.getState().phase), 'intro');
      assert.equal(await page.evaluate(() => window.swarm.getState().total), 0);
      assert.equal(await overlay.locator('.ruler-x,.ruler-y,.guide,.measure').count(), 0);
      assert.equal(await overlay.locator('button').count(), 0);
      const before = await overlay.locator('.workers').evaluate(el => Number(el.style.opacity));
      assert.ok(before > 0 && before <= 1);
      const workerBefore = await overlay.locator('.worker').first().getAttribute('style');
      await page.waitForTimeout(120);
      if (process.env.SWARM_ARTIFACT_DIR) { fs.mkdirSync(process.env.SWARM_ARTIFACT_DIR, { recursive: true }); await page.screenshot({ path: path.join(process.env.SWARM_ARTIFACT_DIR, `intro-${viewport.width}.png`) }); }
      assert.notEqual(await overlay.locator('.worker').first().getAttribute('style'), workerBefore);
      await overlay.getByRole('button', { name: 'Skip animation' }).focus();
      await page.keyboard.press('Tab');
      assert.notEqual(await page.evaluate(() => document.activeElement.tagName), 'DIV');
      await page.locator('#header-button').click();
      await page.locator('#nav-button').click();
      assert.equal(await page.locator('#header-button').textContent(), 'Header clicked');
      assert.equal(await page.locator('#nav-button').textContent(), 'Nav clicked');
      await page.locator('#search').fill('m');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'next');
      assert.equal(await page.evaluate(() => window.swarm.getState().sound), false);
      await page.evaluate(() => {
        document.querySelector('#target h1').textContent = 'Ready dashboard';
        window.swarm.setReady(true);
      });
      await page.waitForFunction(() => window.swarm.getState().phase === 'building');
      const text = await overlay.locator('.stage').evaluate(el => el.textContent);
      assert.ok(!text.includes('Offscreen content'));
      assert.ok(!text.includes('Loading placeholder'));
      assert.equal(await overlay.locator('.ruler-x,.ruler-y,.guide,.measure').count(), 0);
      assert.ok(await page.evaluate(() => window.states.some(state => state.phase === 'transition')));
      await page.waitForFunction(() => window.swarm.getState().phase === 'exiting');
      const departure = await overlay.locator('.worker').evaluateAll(nodes => nodes.map(node => { const m = new DOMMatrix(getComputedStyle(node).transform); return [m.m41, m.m42]; }));
      await page.waitForTimeout(180);
      if (process.env.SWARM_ARTIFACT_DIR) await page.screenshot({ path: path.join(process.env.SWARM_ARTIFACT_DIR, `exit-${viewport.width}.png`) });
      const burst = await overlay.locator('.worker').evaluateAll(nodes => nodes.map(node => { const m = new DOMMatrix(getComputedStyle(node).transform); return [m.m41, m.m42]; }));
      assert.ok(burst.every((p, i) => Math.hypot(p[0] - departure[i][0], p[1] - departure[i][1]) > 10));
      await overlay.waitFor({ state: 'detached', timeout: 10000 });
      const state = await page.evaluate(() => window.swarm.getState());
      assert.equal(state.phase, 'live');
      assert.equal(state.completed, state.total);
      assert.equal(await page.evaluate(() => window.completions), 1);
      assert.ok(state.total > 0);
      await page.evaluate(() => { window.swarm.destroy(); window.mountReact(); });
      await overlay.waitFor();
      assert.equal(await page.evaluate(() => document.querySelectorAll('[data-swarm-overlay]').length), 1);
      await page.evaluate(() => window.reactReady(true));
      await overlay.waitFor({ state: 'detached', timeout: 10000 });
      await page.evaluate(() => { window.reactRoot.unmount(); window.swarm = window.createSwarm({ target: '#target', ready: false, controls: 'minimal' }); window.swarm.start(); });
      await overlay.getByRole('button', { name: 'Skip animation' }).click();
      await overlay.waitFor({ state: 'detached' });
      await page.evaluate(() => { window.swarm.destroy(); window.swarm = window.createSwarm({ target: '#target', introDuration: 0, speed: 1 }); window.swarm.start(); });
      await page.waitForFunction(() => window.swarm.getState().phase === 'building');
      await page.evaluate(() => { document.getElementById('scroller').scrollTop = 100; });
      await overlay.waitFor({ state: 'detached' });
      await page.evaluate(() => { window.swarm.destroy(); window.swarm = window.createSwarm({ target: '#target', ready: false }); window.swarm.start(); window.swarm.destroy(); });
      await page.waitForTimeout(100);
      assert.equal(await overlay.count(), 0);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.evaluate(() => { window.swarm = window.createSwarm({ target: '#target' }); window.swarm.start(); });
      assert.equal(await overlay.count(), 0);
      assert.equal(await page.evaluate(() => window.swarm.getState().phase), 'live');
      assert.deepEqual(errors, []);
      console.log(`PASS ${viewport.width}px: scoped cover before paint, orbit while loading, live data capture, parent pointer/keyboard access, natural completion, React Strict Mode/readiness, skip, scroll, destroy, reduced motion.`);
      await page.close();
    }
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const overlay = page.locator('[data-swarm-overlay]');
    const phrase = 'Xin chào 👩🏽‍💻 e\u0301 — colorful typing wraps naturally across several lines.';
    await page.evaluate(phrase => {
      document.getElementById('target').innerHTML = '<h1 style="font:24px/1.4 Arial;max-width:260px"></h1>';
      document.querySelector('#target h1').textContent = phrase;
      window.swarm = window.createSwarm({ target: '#target', introDuration: 0, smoothTransition: false, typingSpeed: 12, burstOnComplete: false });
      window.swarm.start();
    }, phrase);
    await page.waitForFunction(() => document.querySelector('[data-swarm-overlay]')?.shadowRoot.querySelector('[data-tool="type"]'));
    await page.evaluate(() => {
      window.typedPrefixes = [];
      const observe = () => {
        const root = document.querySelector('[data-swarm-overlay]')?.shadowRoot;
        if (!root) return;
        window.typedPrefixes.push([...root.querySelectorAll('[data-swarm-kind="text"]')].map(node => node.textContent).join(''));
        window.typingFrame = requestAnimationFrame(observe);
      };
      window.typingFrame = requestAnimationFrame(observe);
    });
    // Workers blocked on the text task drift locally, independent of the mouse.
    const idleWorker = overlay.locator('.worker[data-motion="idle"]').last();
    const idleIndex = await idleWorker.evaluate(node => [...node.parentElement.children].indexOf(node));
    const idleBefore = await idleWorker.evaluate(node => { const m = new DOMMatrix(getComputedStyle(node).transform); return [m.m41, m.m42]; });
    await page.mouse.move(10, 10);
    await page.waitForTimeout(650);
    const idleAfter = await overlay.locator('.worker').nth(idleIndex).evaluate(node => { const m = new DOMMatrix(getComputedStyle(node).transform); return [m.m41, m.m42]; });
    assert.ok(Math.hypot(idleAfter[0] - idleBefore[0], idleAfter[1] - idleBefore[1]) < 150);
    const typing = await overlay.evaluate(host => {
      const root = host.shadowRoot, worker = root.querySelector('[data-tool="type"]');
      const text = [...root.querySelectorAll('[data-swarm-kind="text"]')].map(node => node.textContent).join('');
      const m = new DOMMatrix(getComputedStyle(worker).transform);
      return { text, x: m.m41, y: m.m42, color: getComputedStyle(worker.querySelector('.ibeam')).color, workerColor: getComputedStyle(worker).color, height: parseFloat(worker.style.getPropertyValue('--caret-height')) };
    });
    if (process.env.SWARM_ARTIFACT_DIR) await page.screenshot({ path: path.join(process.env.SWARM_ARTIFACT_DIR, 'typing.png') });
    const prefixes = [''];
    for (const unit of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(phrase)) prefixes.push(phrase.slice(0, unit.index + unit.segment.length));
    assert.ok(prefixes.includes(typing.text), JSON.stringify(typing));
    assert.ok(typing.text.length > 0 && typing.text.length < phrase.length);
    assert.equal(typing.color, typing.workerColor);
    assert.ok(typing.height >= 24);
    const measured = await page.evaluate(({ phrase, text }) => {
      const units = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(phrase.slice(0, text.length))];
      const range = document.createRange(), node = document.querySelector('#target h1').firstChild;
      range.setStart(node, units[units.length - 1].index); range.setEnd(node, text.length);
      const box = range.getBoundingClientRect(); return { x: box.right, y: box.top };
    }, { phrase, text: typing.text });
    assert.ok(Math.abs(typing.x - measured.x) < 2 && Math.abs(typing.y - measured.y) < 2, JSON.stringify({ typing, measured }));
    await page.waitForTimeout(1600);
    assert.ok(await page.evaluate(() => window.typedPrefixes.some(text => text.includes('👩🏽‍💻'))));
    assert.ok((await page.evaluate(() => window.typedPrefixes)).every(prefix => prefixes.includes(prefix)));
    await page.evaluate(() => { cancelAnimationFrame(window.typingFrame); window.swarm.destroy(); });
    // Every new visual can be disabled; guides can be explicitly enabled.
    await page.evaluate(() => {
      window.states = [];
      window.swarm = window.createSwarm({ target: '#target', ready: false, introDuration: 0, speed: 8,
        showRulers: true, showGuides: true, clickToSkip: false, floatingIntro: false, floatingIdle: false,
        fadeIn: false, smoothTransition: false, typing: false, burstOnComplete: false,
        onStateChange: state => window.states.push(state) });
      window.swarm.start();
    });
    assert.equal(await overlay.locator('.ruler-x,.ruler-y').count(), 2);
    assert.equal(await overlay.locator('.workers').evaluate(el => el.style.opacity), '1');
    await overlay.locator('.cover').click({ position: { x: 1200, y: 130 } });
    assert.equal(await overlay.count(), 1);
    await page.evaluate(() => window.swarm.setReady(true));
    await page.waitForFunction(() => window.swarm.getState().phase === 'building');
    assert.ok(await overlay.locator('.guide').count() > 0);
    await overlay.waitFor({ state: 'detached', timeout: 10000 });
    assert.ok(await page.evaluate(() => !window.states.some(state => state.phase === 'transition' || state.phase === 'exiting')));
    // Snapshot geometry work must span frames rather than freezing the orbit.
    await page.evaluate(() => {
      document.querySelector('#target h1').textContent = 'cooperative measurement '.repeat(180);
      window.captureFrames = 0;
      const countFrame = () => { window.captureFrames++; if (window.swarm?.getState().phase === 'intro') requestAnimationFrame(countFrame); };
      window.swarm = window.createSwarm({ target: '#target', introDuration: 0, snapshotBudget: 1, speed: 8 });
      window.swarm.start(); requestAnimationFrame(countFrame);
    });
    await page.waitForFunction(() => window.swarm.getState().phase === 'transition');
    assert.ok(await page.evaluate(() => window.captureFrames > 2));
    await page.evaluate(() => window.swarm.destroy());
    assert.equal(await overlay.count(), 0);
    await page.evaluate(() => {
      document.getElementById('target').innerHTML = '<p>Cleanup handoff</p>';
      window.swarm = window.createSwarm({ target: '#target', introDuration: 0 }); window.swarm.start();
    });
    await page.waitForFunction(() => window.swarm.getState().phase === 'transition');
    await page.evaluate(() => window.swarm.destroy());
    await page.waitForTimeout(100);
    assert.equal(await overlay.count(), 0);
    await page.evaluate(() => { window.swarm = window.createSwarm({ target: '#target', introDuration: 0, speed: 8 }); window.swarm.start(); });
    await page.waitForFunction(() => window.swarm.getState().phase === 'exiting');
    await page.evaluate(() => window.swarm.destroy());
    await page.waitForTimeout(100);
    assert.equal(await overlay.count(), 0);
    // Toolbar actions keep working and pauses freeze the new phases too.
    await page.evaluate(() => { window.swarm = window.createSwarm({ target: '#target', introDuration: 0, speed: 8, controls: true }); window.swarm.start(); });
    await page.waitForFunction(() => window.swarm.getState().phase === 'transition');
    await overlay.getByRole('button', { name: 'Pause / resume animation' }).click();
    const handoffFrame = await overlay.locator('.workers').innerHTML();
    await page.waitForTimeout(120);
    assert.equal(await overlay.locator('.workers').innerHTML(), handoffFrame);
    assert.equal(await page.evaluate(() => window.swarm.getState().phase), 'paused');
    await overlay.getByRole('button', { name: 'Pause / resume animation' }).click();
    await page.waitForFunction(() => window.swarm.getState().phase === 'exiting');
    await overlay.getByRole('button', { name: 'Pause / resume animation' }).click();
    const exitFrame = await overlay.locator('.workers').innerHTML();
    await page.waitForTimeout(120);
    assert.equal(await overlay.locator('.workers').innerHTML(), exitFrame);
    await overlay.getByRole('button', { name: 'Pause / resume animation' }).click();
    await overlay.waitFor({ state: 'detached', timeout: 10000 });
    await page.evaluate(() => { window.swarm = window.createSwarm({ target: '#target', introDuration: 0, smoothTransition: false, speed: 8, finishBehavior: 'flock' }); window.swarm.start(); });
    await page.waitForFunction(() => window.swarm.getState().phase === 'complete');
    await page.waitForTimeout(150);
    assert.equal(await overlay.getAttribute('data-swarm-phase'), 'complete');
    await page.evaluate(() => window.swarm.goLive());
    assert.equal(await overlay.count(), 0);
    // Clicking the effect must never activate a covered application button.
    await page.evaluate(() => {
      document.getElementById('target').innerHTML = '<button style="width:200px;height:100px" onclick="window.clickedUnderneath=true">Underlying action</button>';
      window.clickedUnderneath = false;
      window.swarm = window.createSwarm({ target: '#target', ready: false }); window.swarm.start();
    });
    const buttonBox = await page.locator('#target button').boundingBox();
    await page.mouse.click(buttonBox.x + 10, buttonBox.y + 10);
    await overlay.waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => window.clickedUnderneath), false);
    assert.deepEqual(errors, []);
    console.log('PASS motion options: hidden rulers/guides by default, fade, transition, radial exit, Unicode typing and measured colored caret, opt-outs, cooperative snapshot, no click-through.');
    await page.close();
    const mediaPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const mediaErrors = []; mediaPage.on('pageerror', error => mediaErrors.push(error.message));
    await mediaPage.goto(`http://127.0.0.1:${server.address().port}`);
    const mediaOverlay = mediaPage.locator('[data-swarm-overlay]');
    await mediaPage.evaluate(() => {
      document.getElementById('target').innerHTML = '<section style="width:500px;height:300px;background:#eee"><svg style="visibility:visible" width="60" height="60" viewBox="0 0 60 60"><rect width="60" height="60" fill="#00ff00" style="visibility:visible"/></svg></section>';
      window.swarm = window.createSwarm({ target: '#target', introDuration: 0, transitionDuration: 1500 }); window.swarm.start();
    });
    await mediaPage.waitForFunction(() => window.swarm.getState().phase === 'transition');
    await mediaPage.evaluate(() => window.swarm.pause());
    const media = mediaOverlay.locator('[data-swarm-kind="media"]');
    assert.equal(await media.count(), 1);
    assert.equal(await media.evaluate(node => node.style.opacity), '0');
    // The cloned SVG explicitly restores visibility, reproducing the original
    // bug. A screenshot verifies its compositing ancestor still hides it.
    assert.equal(await media.locator('svg').evaluate(node => getComputedStyle(node).visibility), 'visible');
    const svgBox = await mediaPage.locator('#target svg').boundingBox();
    const beforeSvg = await mediaPage.screenshot();
    const pixel = await mediaPage.evaluate(async ({ data, x, y }) => {
      const image = new Image(); image.src = 'data:image/png;base64,' + data; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
      return [...context.getImageData(Math.round(x), Math.round(y), 1, 1).data];
    }, { data: beforeSvg.toString('base64'), x: svgBox.x + 30, y: svgBox.y + 30 });
    assert.ok(pixel[0] > 240 && pixel[1] > 240 && pixel[2] > 240, JSON.stringify(pixel));
    await mediaPage.evaluate(() => {
      window.earlyMedia = false;
      const monitor = () => {
        const root = document.querySelector('[data-swarm-overlay]')?.shadowRoot;
        if (!root) return;
        for (const node of root.querySelectorAll('[data-swarm-kind="media"]')) {
          if (node.style.opacity !== '0' && node.dataset.swarmProgress === undefined) window.earlyMedia = true;
        }
        requestAnimationFrame(monitor);
      };
      window.swarm.resume(); requestAnimationFrame(monitor);
    });
    await mediaOverlay.waitFor({ state: 'detached', timeout: 15000 });
    assert.equal(await mediaPage.evaluate(() => window.earlyMedia), false);
    // Measure actual simultaneous work before the first ancestor is done.
    const parallelRun = async parallelDrawing => {
      await mediaPage.evaluate(parallelDrawing => {
        window.swarm?.destroy();
        document.getElementById('target').innerHTML = '<section style="height:550px;background:#f0f0f0">' + Array.from({ length: 12 }, (_, i) => '<div style="display:inline-block;vertical-align:top;width:120px;height:90px;background:#e3edf5;margin:4px">Card ' + i + '</div>').join('') + '</section>';
        window.maximumParallel = 0; window.staging = 0;
        window.swarm = window.createSwarm({ target: '#target', introDuration: 0, smoothTransition: false, cursorCount: 8, parallelDrawing, speed: 2 }); window.swarm.start();
        const monitor = () => {
          const root = document.querySelector('[data-swarm-overlay]')?.shadowRoot;
          if (!root) return;
          const first = root.querySelector('[data-swarm-kind]');
          if (Number(first?.dataset.swarmProgress || 0) < 1) window.maximumParallel = Math.max(window.maximumParallel, root.querySelectorAll('[data-motion="working"]').length);
          window.staging = Math.max(window.staging, root.querySelectorAll('[data-motion="staging"]').length);
          requestAnimationFrame(monitor);
        };
        requestAnimationFrame(monitor);
      }, parallelDrawing);
      await mediaPage.waitForFunction(() => Number(document.querySelector('[data-swarm-overlay]')?.shadowRoot.querySelector('[data-swarm-kind]')?.dataset.swarmProgress) >= 1);
      const values = await mediaPage.evaluate(() => ({ parallel: window.maximumParallel, staging: window.staging }));
      await mediaPage.evaluate(() => window.swarm.destroy());
      return values;
    };
    const strict = await parallelRun(false), parallel = await parallelRun(true);
    assert.equal(strict.parallel, 1);
    assert.ok(parallel.parallel > 1, JSON.stringify({ strict, parallel }));
    assert.ok(parallel.staging > 0);
    // Resize the pool in place; preserve the overlay and in-flight drawings.
    await mediaPage.evaluate(() => {
      window.swarm = window.createSwarm({ target: '#target', ready: false, cursorCount: 4, introDuration: 0, speed: 2 }); window.swarm.start();
      window.originalHost = document.querySelector('[data-swarm-overlay]');
      window.swarm.setCursorCount(12);
    });
    assert.equal(await mediaOverlay.locator('.worker').count(), 12);
    await mediaPage.evaluate(() => window.swarm.setCursorCount(6));
    assert.equal(await mediaOverlay.locator('.worker').count(), 6);
    assert.equal(await mediaPage.evaluate(() => window.originalHost === document.querySelector('[data-swarm-overlay]')), true);
    await mediaPage.evaluate(() => window.swarm.setReady(true));
    await mediaPage.waitForFunction(() => document.querySelector('[data-swarm-overlay]')?.shadowRoot.querySelectorAll('[data-motion="working"]').length >= 3);
    await mediaPage.evaluate(() => window.swarm.setCursorCount(2));
    await mediaPage.waitForFunction(() => window.swarm.getState().agents === 2);
    assert.equal(await mediaPage.evaluate(() => window.originalHost === document.querySelector('[data-swarm-overlay]')), true);
    assert.equal(await mediaOverlay.locator('.worker').count(), 2);
    await mediaPage.evaluate(() => window.swarm.goLive());
    // CSS rotation/transforms are preserved during reconstruction, and inline/field text is typed cohesively.
    await mediaPage.evaluate(() => {
      const root = document.getElementById('target');
      root.innerHTML = `
        <div id="rotated-card" style="width:220px;height:80px;padding:16px;background:#1a3c50;border:1px solid #82dec5;border-radius:16px;transform:rotate(-7deg)">
          <span id="rotated-label" style="color:#edfdf8;font:600 22px Arial">nail360</span>
        </div>
        <div id="css-rotate-badge" style="width:140px;height:44px;margin-top:24px;background:#e3edf5;rotate:12deg;padding:8px">Tilted badge</div>
        <p id="inline-flow" style="margin-top:24px;font:16px/1.5 Arial">Manage <strong>salons</strong>, <em>accounts</em> and <a href="#ops">operations</a><br>from one workspace.</p>
        <div id="tip-row"><kbd style="padding:2px 6px;border:1px solid #ccc;background:#fff">Ctrl K</kbd> <span>Jump to page</span></div>
        <input id="typed-input" value="Search salons" style="margin-top:12px;padding:6px 10px;border:1px solid #ccc" />
      `;
      const multi = document.createElement('div');
      multi.id = 'jsx-nodes';
      multi.append(document.createTextNode('api'), document.createTextNode(': '), document.createTextNode('UP'), document.createTextNode(' '), document.createTextNode('(4ms)'));
      root.append(multi);
      window.swarm = window.createSwarm({ target: '#target', introDuration: 0, transitionDuration: 1200, speed: 2 });
      window.swarm.start();
    });
    await mediaPage.waitForFunction(() => window.swarm.getState().phase === 'transition');
    await mediaPage.evaluate(() => window.swarm.pause());
    const snapshotCheck = await mediaPage.evaluate(() => {
      const root = document.querySelector('[data-swarm-overlay]').shadowRoot;
      const groups = [...root.querySelectorAll('[data-swarm-group]')];
      const transforms = groups.map(g => ({ transform: g.style.transform, rotate: g.style.getPropertyValue('rotate') }));
      const liveCardTransform = document.getElementById('rotated-card').style.transform;
      const liveBadgeRotate = document.getElementById('css-rotate-badge').style.getPropertyValue('rotate');
      const textLayers = [...root.querySelectorAll('[data-swarm-kind="text"]')];
      const insideGroup = textLayers.some(node => node.closest('[data-swarm-group]') !== null);
      return { groupCount: groups.length, transforms, liveCardTransform, liveBadgeRotate, textLayerCount: textLayers.length, insideGroup };
    });
    assert.equal(snapshotCheck.groupCount, 2, JSON.stringify(snapshotCheck));
    assert.equal(snapshotCheck.insideGroup, true);
    assert.equal(snapshotCheck.liveCardTransform, 'rotate(-7deg)');
    assert.equal(snapshotCheck.liveBadgeRotate, '12deg');
    // 7 cohesive text layers: nail360, Tilted badge, inline-flow paragraph, Ctrl K, Jump to page, input text, jsx-nodes.
    assert.equal(snapshotCheck.textLayerCount, 7, JSON.stringify(snapshotCheck));
    await mediaPage.evaluate(() => window.swarm.resume());
    await mediaPage.waitForFunction(() => window.swarm.getState().phase === 'exiting');
    const exitAngles = await mediaOverlay.locator('.worker .pointer').evaluateAll(nodes => nodes.map(node => node.style.transform));
    assert.ok(new Set(exitAngles).size > 2);
    await mediaOverlay.waitFor({ state: 'detached', timeout: 15000 });
    assert.deepEqual(mediaErrors, []);
    console.log('PASS SVG compositing before drawing, parallel scheduling versus strict dependencies, busy staging, rotated elements, cohesive inline/input typing, random exit scatter and live cursor-pool changes.');
    await mediaPage.close();
    // The package can be imported and rendered without browser globals.
    const React = require('react');
    const { renderToString } = require('react-dom/server');
    const { SwarmRebuild, createSwarmRebuild } = require('../dist/index.cjs');
    assert.equal(renderToString(React.createElement(SwarmRebuild, { ready: false })), '');
    createSwarmRebuild().destroy();
    console.log('PASS server import and rendering.');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
