# react-swarm-rebuild

A swarm of colorful, multiplayer-style cursors rebuilds your React page: an orbiting intro, drawn boxes, typed text, media reveals, alignment guides, option-drag duplicates, and a flock that follows your mouse.

**Author: Nguyễn Quốc Cường · MIT · React 18 / 19 · TypeScript · ESM / CommonJS**

An independent implementation inspired by [Swarm](https://califa.github.io/swarm/) by Joel Califa and [Swarm Cursors](https://github.com/DhvanilPatel/swarm-cursors) by Dhvanil Patel. See [NOTICE.md](./NOTICE.md). No upstream code or artwork is bundled.

## Install

After this package has been published:

```sh
npm install react-swarm-rebuild
```

Before publication, build and install the local tarball in another project:

```sh
# In this repository
npm ci
npm pack
# In your React application (replace the path)
npm install /absolute/path/react-swarm-rebuild-0.1.0.tgz
```

No CSS import, provider, extension permissions, or runtime dependencies beyond the React peer dependencies are needed.

## React component

```tsx
import { SwarmRebuild } from 'react-swarm-rebuild';

export default function App() {
  return (
    <>
      <YourPage />
      <SwarmRebuild sound={false} tour />
    </>
  );
}
```

`SwarmRebuild` renders no wrapper and starts on mount. Set `active={false}` to stop it. Switching back to `true` creates a fresh snapshot. The original React tree stays mounted throughout the performance; **Go live** reveals the real interactive UI. **Esc** closes the overlay; **M** toggles audio. Reduced-motion preferences are respected by default.

## Start from a button

```tsx
import { useSwarmRebuild } from 'react-swarm-rebuild';

export default function App() {
  const swarm = useSwarmRebuild({ cursorCount: 20, sound: true, tour: true });

  return (
    <>
      <button onClick={swarm.start}>Rebuild this page</button>
      <YourPage />
      <p>{Math.round(swarm.state.progress * 100)}% complete</p>
    </>
  );
}
```

For a section, use a selector, an element, or a React ref:

```tsx
import { useRef } from 'react';
import { SwarmRebuild } from 'react-swarm-rebuild';

export function Preview() {
  const section = useRef<HTMLDivElement>(null);
  return <>
    <div ref={section}><YourPage /></div>
    <SwarmRebuild target={section} />
  </>;
}
```

The animation always uses a full-viewport overlay, even when targeting a section. Content outside the selected section is covered during the performance.

Add `data-swarm-ignore` to skip a subtree in the visual snapshot. Use it for private content or controls that should not appear in the reconstruction.

## Next.js App Router

The package entry includes the `"use client"` directive and does not access browser globals during import or server rendering. Render it from a client component. No `ssr: false` workaround is needed.

```tsx
'use client';
import { SwarmRebuild } from 'react-swarm-rebuild';

export function PageRebuild() {
  return <SwarmRebuild target="#page-content" finishBehavior="live" />;
}
```

Start after your data and fonts are ready for the most accurate snapshot. Content is captured at the instant of `start()`; subsequent application changes appear when you go live or replay.

## Options

| Prop / option | Default | Meaning |
| --- | --- | --- |
| `target` | `document.body` | Selector, connected HTMLElement, or React ref |
| `cursorCount` | `16` | 2–48 workers |
| `speed` | `1` | Playback speed, 0.25–8 |
| `sound` | `false` | Optional synthesized Web Audio |
| `tour` | `false` | Auto-scroll the document as work progresses |
| `controls` | `true` | Floating playback toolbar |
| `showNames` | `false` | Optional collaborator name tags |
| `names` | Built-in names | Nonempty array of names |
| `colors` | Built-in palette | Nonempty array of CSS colors |
| `introDuration` | `1600` | Orbit intro duration, in milliseconds |
| `maxLayers` | `2500` | Snapshot limit (1–10,000); document height capped at 40,000px |
| `zIndex` | `2147483000` | Overlay stacking order |
| `background` | Page background | Overlay background color |
| `respectReducedMotion` | `true` | Go directly to the real UI when reduced motion is requested |
| `finishBehavior` | `'flock'` | Stay with cursors, or `'live'` to remove the overlay automatically |
| `onStateChange` | — | Receives a fresh `SwarmState` on changes and at most about 7 times/second during playback |
| `onComplete` | — | Called once per finished run, including reduced-motion skips |
| `onError` | — | Snapshot / target error callback |
| `active` | `true` | Component only: start/stop on changes |

`speed`, `sound`, and `tour` props update an existing hook/component instance. Other options apply to the next start/replay. Speeds outside the supported range are clamped; invalid numbers keep the existing/default setting.

## Controls and state

Both `useSwarmRebuild()` and the component's `ref` expose:

```ts
start(); replay(); pause(); resume();
goLive(); stop(); destroy();
setSpeed(2); setSound(true); setTour(true);
getState();
```

`useSwarmRebuild()` also returns reactive `state`. A state includes `phase`, `completed`, `total`, `progress` (0–1), `agents`, `speed`, `sound`, and `tour`. Phases are `idle`, `scanning`, `intro`, `building`, `paused`, `complete`, and `live`. Without Tour, layers below the viewport wait for you to scroll before the run can complete. `pause()` stops the animation clock and auto-tour.

For use without React lifecycle management:

```ts
import { createSwarmRebuild } from 'react-swarm-rebuild';

const swarm = createSwarmRebuild({ target: '#app', tour: true });
swarm.start(); // Browser only; ideally in a user click handler.
// On navigation / teardown:
swarm.destroy();
```

`destroy()` permanently disposes an imperative instance. The React hook releases its instance automatically on unmount and supports React Strict Mode. Use one active instance per document.

## Browser support and boundaries

Designed for modern browsers with Shadow DOM, DOM Range, requestAnimationFrame, and CSS clip-path. Automated browser tests run in Chrome on desktop and mobile viewport sizes.

This is a visual DOM reconstruction, not a browser screenshot renderer. It preserves measured text placement, computed box styles, gradients, borders, shadows, common controls, images, inline SVGs and readable 2D canvases. It reads open shadow roots. Animation and application behavior are frozen in the visual layer; your original application continues running underneath.

Known boundaries:

- Cross-origin iframes are placeholders. Unlike a privileged Chrome extension, a React library cannot capture browser-tab screenshots.
- Protected/WebGL canvases and unavailable video frames may be blank. Videos are captured as a single frame or poster.
- Rotated/skewed/perspective elements, complex masks, blend effects, pseudo-elements, slots, custom web components and unusual text shaping may differ from the source.
- Snapshot geometry is fixed for that run. A viewport width change takes a new snapshot; fixed/sticky elements use their position at snapshot time.
- An inner scrolling container captures its current visible content. Tour scrolls the document, not every nested scroll area.
- Offscreen lazy images must already be loaded. Unloaded content, extremely long text nodes (12,000 characters per node), and layers beyond the configured cap are omitted.
- Sound starts only when browser audio policy allows it. Click **♪ On** if autoplay is blocked.
- The overlay covers the document while active; use **Go live** / **Esc** to interact with the page. Mounting in a top-layer `<dialog>` or inside transformed document roots is not supported.

## Develop and verify

```sh
npm ci
npm run dev          # http://localhost:5173
npm run typecheck
npm test             # Unit tests and server-rendering tests
npm run build        # dist: ESM, CJS, declarations, source maps
npm run test:browser # Chrome desktop + mobile integration tests
npm run build:demo
npm pack --dry-run
npm pack && npm run test:package # Install tarball in React 18/19 consumers and verify imports/types
```

Browser tests use `/usr/bin/google-chrome` when available, otherwise Playwright's Chromium (`npx playwright install chromium`). Set `CHROME_PATH` to use another Chrome/Chromium executable. Example: `CHROME_PATH=/path/to/chromium npm run test:browser`. The demo loads optional Google Fonts; the library itself performs no network requests except those made by existing media in the snapshot.

## Publish to npm

The package name is `react-swarm-rebuild`; metadata identifies **Nguyễn Quốc Cường** as the author. The name was available when checked on November 5, 2026; availability can change.

```sh
npm ci
npm run check
npm run build:demo
npm pack --dry-run
npm login
npm publish --access public
```

`prepublishOnly` runs type checks, unit tests, builds, and browser tests. `prepack` rebuilds and generates types. Only `dist`, README, LICENSE, NOTICE, and package metadata enter the package; the demo and tests stay out. Follow your npm account's authentication/2FA prompts. No npm credentials are stored in this repository.

To publish another release, update the version with `npm version patch` (or `minor` / `major`), rerun the checks, then publish. Add your actual repository URL to `package.json` after creating a remote repository; no fictional links are included.
