# QLever to WebAssembly

QLever (SPARQL engine) compiled to WebAssembly via Emscripten, served as a local web app.

## Project structure

- `src/` — TypeScript frontend (Vite + Tailwind)
  - `wasm/worker.ts` — module Web Worker that loads and runs the WASM module
  - `wasm/loader.ts` — main-thread API that communicates with the worker
  - `ui/` — UI event handlers and rendering
  - `ui/state.ts` — the app state machine; every control's enabled/disabled state
    and its explanation are derived from it, so no action can be triggered that
    would fail
  - `ui/elements.ts` — resolves the UI's DOM nodes by id, so the other modules
    import them instead of looking them up (the log panel is the exception: it is
    resolved in `wasm/loader.ts`, which owns the log)
  - `engine/` — query execution
  - `main.ts` — entry point: wires the UI up, then reports the engine's outcome
- `index.html` — loads `src/main.ts`
- `Dockerfile` — builds the site with Node, then serves `dist/` with nginx
- `docker/nginx/` — the nginx config that serving the build requires

## WASM module dependency

The compiled engine comes from the [`@ad-freiburg/qlever`](https://www.npmjs.com/package/@ad-freiburg/qlever)
npm package (published from the upstream QLever repo). It ships `qlever.mjs` — an
ES module whose default export is the Emscripten factory — plus `qlever.wasm` and
the `qlever.d.ts` type definitions, which is why this repo carries none of its own.
`worker.ts` imports the factory directly; the module locates `qlever.wasm` and
spawns its pthread workers via `import.meta.url`, and Vite serves those assets
from `node_modules`.

To move to a newer engine, bump the dependency (`npm install @ad-freiburg/qlever@<version>`).

## Running

- `npm install` — install dependencies (fetches the WASM package from npm)
- `npm run dev` — start the Vite dev server (http://localhost:5173)
- `npm run build` — type-check and build for production
- `npm run preview` — serve the production build locally

## Notes

- The engine uses threads, so index building and querying are blocking calls; they
  run inside a Web Worker (`worker.ts`). It must be a **module** worker (`{ type:
  'module' }` in `loader.ts`) so it can `import` the ES module.
- `SharedArrayBuffer` is required (pthreads); browsers cap it at 4 GB. The page
  must therefore be cross-origin isolated — `vite.config.ts` sets the required
  COOP/COEP headers on both the dev and the preview server, and any host serving
  the production build has to send them as well — `docker/nginx/` does this for
  the container, from a snippet included in every `location` (nginx's
  `add_header` replaces the inherited set rather than adding to it). `initWasm()` checks
  `crossOriginIsolated` up front so a missing header is reported as itself rather
  than as an opaque load failure.
- Objects created with `new` from the module own memory in the WebAssembly heap
  that the JS garbage collector does not free. Declare them with `using` so they
  are released when the block ends; only the long-lived `Qlever` engine is kept
  in a variable and released by hand (`destroyEngine()` in `worker.ts`).
- Gate user actions through `setAppState()`/`refreshControls()` rather than toggling
  controls by hand. The engine runs one blocking job at a time, so every long-running
  job (`building`, `querying`, `extracting`) is its own state, claimed *before* the
  first `await` so a second trigger is refused instead of silently queued. Action
  buttons use `aria-disabled` (not the `disabled` attribute) so they stay focusable,
  keep their hover tooltip, and announce themselves to screen readers; they remain
  clickable on purpose and their handlers refuse the action via `blockedReason()`.
  Only data-entry fields whose input could not lead anywhere are really `disabled`.
- Status has two channels: `engineStatus`, owned by the state machine, carries the
  phase and is the only status line that pulses; `buildIndexStatus`, written through
  `setBuildDetail()`, carries the specifics a state cannot know, such as the source
  filename or an error text. (The result panel has its own "Running query..."
  placeholder, set by `executor.ts`.)
- The module is built for wasm64, so it needs a recent browser (or Node.js >= 24,
  which is also what the package's `engines` field requires).
- The production image pre-compresses the assets at build time and lets nginx's
  `gzip_static` serve them, because gzipping the ~60 MB engine `.wasm` per
  request is not something to pay for. Everything Vite fingerprints under
  `/assets` is served `immutable`; `index.html`, which names those fingerprints,
  is served `no-cache`.
