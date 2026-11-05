# react-swarm-rebuild

A swarm of multiplayer-style cursors reconstructs your React UI. React 18 / 19, TypeScript, ESM and CommonJS. MIT, Nguyễn Quốc Cường.

## Component and loading transitions

```tsx
import { useRef } from 'react';
import { SwarmRebuild } from 'react-swarm-rebuild';

export function Dashboard({ loading, children }) {
  const content = useRef<HTMLDivElement>(null);
  return <>
    <div ref={content}>{children}</div>
    <SwarmRebuild target={content} ready={!loading} controls="minimal" />
  </>;
}
```

The overlay appears immediately and the cursors orbit while `ready` is false. Your original React tree stays mounted and loads normally underneath. Once `ready` is true and the minimum intro has elapsed, Swarm measures the current content and starts rebuilding. Changes to `ready` do not restart the orbit. Signal readiness after your data and fonts have settled.

On completion, the overlay and all cursors are removed automatically. Set `finishBehavior="flock"` to keep the cursors until the user chooses **Go live**. **Esc** and **Skip animation** reveal the working UI immediately.

A component target automatically limits the effect to that component's visible area, intersected with scrolling/clipping ancestors and the viewport. Headers, sidebars, parent controls and keyboard navigation outside the component keep working. Offscreen content is omitted from the scoped snapshot, so inner scrolling cannot prevent completion. Scrolling or resizing during reconstruction reveals the real UI instead of leaving a misaligned snapshot. The next run captures the new layout.

Without a target, Swarm uses `document.body` and a full-viewport overlay. You can also explicitly choose `scope="viewport"` for a section target.

For an application entrance with no initial content flash, start the imperative controller in `useLayoutEffect`, after the content's DOM has mounted and before the browser paints. The React component uses `useEffect`, preserving server-rendering compatibility.

## Imperative controller

```ts
import { createSwarmRebuild } from 'react-swarm-rebuild';

const swarm = createSwarmRebuild({
  target: '#overview',
  ready: false,
  controls: 'minimal',
});
swarm.start();          // Install the cover and start orbiting.
// Render/load content in parallel.
swarm.setReady(true);   // Capture the final content, then reconstruct it.
// When navigating away:
swarm.destroy();
```

`useSwarmRebuild(options)` exposes the same controller plus reactive `state`. Controllers support `start`, `replay`, `stop`, `goLive`, `pause`, `resume`, `setReady`, `setSpeed`, `setSound`, `setTour`, `getState`, and `destroy`. A destroyed imperative instance cannot be restarted. The React hook supports Strict Mode and disposes its instance on unmount.

## Options

| Option | Default | Purpose |
| --- | --- | --- |
| `target` | `document.body` | Selector, HTMLElement or React ref |
| `scope` | target for components, viewport for body | Clip to a component or cover the viewport |
| `ready` | `true` | Hold the orbit until content is ready |
| `finishBehavior` | `live` | Automatically remove the effect, or keep `flock` |
| `controls` | `true` | Full toolbar, `minimal` status/skip, or `false` |
| `cursorCount` | `16` | 2–48 workers |
| `speed` | `1` | Playback multiplier, 0.25–8 |
| `introDuration` | `1600` | Minimum orbit time in animation milliseconds |
| `sound` | `false` | Optional synthesized audio, subject to browser audio policy |
| `tour` | `false` | Auto-scroll the document in viewport mode |
| `showNames` | `false` | Show optional collaborator names |
| `names`, `colors` | Built-in palette | Custom nonempty arrays |
| `maxLayers` | `2500` | Snapshot limit, 1–10,000 |
| `background` | Nearest opaque ancestor | Overlay background color |
| `zIndex` | `2147483000` | Overlay stacking order |
| `respectReducedMotion` | `true` | Skip the effect for reduced motion |
| `active` | `true` | React component: start/stop when this changes |

Callbacks: `onStateChange(state)`, `onComplete()`, `onError(error)`. State includes `phase`, `progress`, `completed`, `total`, `agents`, `speed`, `sound`, and `tour`. Phases: `idle`, `scanning`, `intro`, `building`, `paused`, `complete`, `live`.

`ready`, `speed`, `sound`, and `tour` update an existing React instance. Other options apply to the next start/replay. Use one active instance per target. Add `data-swarm-ignore` to exclude a subtree from the visual snapshot.

## Install and develop

```sh
npm install react-swarm-rebuild
# Or install a local release:
npm install /path/to/react-swarm-rebuild-0.1.1.tgz

npm install
npm run typecheck
npm run build
npm run test:browser  # Requires Chrome; optionally set CHROME_PATH.
npm pack
```

The library needs no CSS import or runtime dependencies beyond React peers. It is safe to import during server rendering. Browsers need Shadow DOM, DOM Range, requestAnimationFrame and CSS clip-path.

Snapshots preserve measured text, common boxes, gradients, controls, images, SVGs and readable 2D canvases. They are a visual reconstruction, not a screenshot: complex transforms, pseudo-elements, custom elements, protected canvases, cross-origin iframes and unavailable media may differ. Inner scroll regions capture their visible content. Lazy content must already be loaded. Geometry is frozen during reconstruction; the original application continues running underneath.

## 0.1.1

- Component-scoped overlays preserve surrounding layout and interactions.
- Orbit before snapshot; readiness can change while data renders in parallel.
- Automatic cleanup on completion, including inner scrolling containers.
- Minimal skip controls for application entrances.

Inspired by Swarm by Joel Califa and Swarm Cursors by Dhvanil Patel. This is an independent implementation; no upstream code or artwork is bundled. See [NOTICE.md](./NOTICE.md).
