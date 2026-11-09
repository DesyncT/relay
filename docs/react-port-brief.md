# Relay React port: shared brief (read fully before starting)

Goal: replace the legacy vanilla renderer (`index.html` inline script + `sidebar.js`, `panels.js`, `titlebar.js`, `quick-actions.js`,
`routing-ui.js`, `skills-ui.js`, `themes.js`, `backgrounds.js`) with a React 19 + Framer Motion app under `src/`, with **behavior parity**
and an Awwwards-grade, smooth, polished feel. Legacy files stay in place (the maintainer deletes them at integration); **never edit them**,
never edit main-process files (`main.js`, `sessions.js`, ...) unless your task says so.

## Existing foundation (already built, read it)
- `src/main.jsx` imports all legacy CSS + `src/styles/base.css` (the legacy inline `<style>`, extracted verbatim). **Reuse the existing class
  names/ids/CSS variables** so the look carries over; port markup 1:1 first, then add motion. New CSS goes in your own file
  `src/styles/<yourtask>.css`, imported from your component. Do not edit `base.css` or other agents' css; override with more specific selectors if you must.
- `src/api.js`: `call(channel, ...args)`, `useIpcEvent(channel, handler)` (push events from main), `useCall(channel, ...args)` -> `{data, reload, setData}`.
  IPC channels: grep `ipcMain.handle(` / `.send(` across `*.js` in the repo root to see exact args/returns. The legacy code shows how each is used.
- `src/store.js`: tiny shared store: `useStore(selector)`, `setState(patch)`, `getState()`. Holds `tab`, `openSid`, `cfg`, `profile`. You may add **namespaced**
  fields via `setState` (e.g. `chatReplying`) without editing store.js. Keep everything else in component state/hooks.
- `src/motion.js`: shared presets (`spring`, `springSoft`, `ease`, `fadeUp`, `pop`, `stagger`, `item`). Use them; `MotionConfig reducedMotion="user"` is global.
- `src/screens/index.js` registers screens; `src/screens/<Name>.jsx` stubs exist. Replace only the stub(s) you own.
- `src/components/Nav.jsx` / `App.jsx` are the shell (owned by the "shell" task only).

## Rules
- Ownership: only create/edit the files listed in your task. If you need something from another task's area, read the legacy code, don't edit theirs;
  if you must depend on another component, import it by the agreed path and note it in your report.
- Port logic faithfully: every handler, keyboard shortcut, aria attribute, empty/loading/error state, draft/localStorage key, IPC call. Don't drop features.
  `index.html` script body starts at line 710; line numbers given in your task are file lines.
- React idioms: hooks, no `document.querySelector` for your own UI, no `innerHTML` with unescaped data (the legacy `md()` escapes first; port that
  sanitising behavior exactly or use React elements). Clean up timers/listeners in effects. Keep the a11y semantics (roles, aria-live, labels, focus handling).
- Motion: purposeful, fast (150-400ms), spring/expo-out via `motion.js`. Entrances/exits with `AnimatePresence`, `layout`/`layoutId` for reorders and active
  indicators, hover/tap micro-interactions, staggered list reveals, smooth number/height transitions. Never block interaction; respect reduced motion;
  animate only transform/opacity (and layout via Framer). Skeletons > spinners. Don't over-animate dense data views.
- No new npm dependencies. No TypeScript. No test files in the repo root; keep your check scripts in `/tmp`.
- Don't run `git commit`/`git add`. Don't run `npm start`, or touch `renderer-dist/`, or launch the real app (single-instance lock, real user data).

## Verify your work (required)
1. Private build: `node tools/build.cjs /tmp/<task>/out` (must succeed with no errors).
2. Write fixtures `/tmp/<task>/fx.json` ({"channel": returnValue}) copied from the legacy code's expectations, and an eval script `/tmp/<task>/check.js`
   (runs in the page; return plain JSON: DOM assertions, click simulation via `document.querySelector(...).click()`, `__emit('chat:msg', {...})` to push events,
   `__calls()` to see recorded IPC calls).
3. `node_modules/.bin/electron tools/harness.cjs --dir /tmp/<task>/out --fixtures /tmp/<task>/fx.json --eval /tmp/<task>/check.js --out /tmp/<task>/shot.png`
   -> must print `errors: []`. **Look at the screenshot** (Read the PNG) at 1280x800 and 860x760 (`--size 860x760`) and fix visual regressions or layout bugs.
   To show a screen other than usage in the harness, eval `window.__setTab && ...` is not provided: instead add `<tab>` via `import('/store.js')` is not possible; simplest: your eval
   clicks the nav button (`document.querySelectorAll('nav button')[n].click()`).
4. Report (max 12 lines): files created, what is complete, anything left or deliberately different, any cross-task dependencies, and how you verified.
