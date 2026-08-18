# QLever to WebAssembly

QLever (SPARQL engine) compiled to WebAssembly via Emscripten, served as a local web app.

## Project structure

- `src/` — TypeScript frontend (Vite + Tailwind)
  - `wasm/worker.ts` — module Web Worker that loads and runs the WASM module
  - `wasm/loader.ts` — main-thread API that communicates with the worker
  - `ui/` — UI event handlers and rendering
  - `engine/` — query execution
- `index.html` — app entry point

## WASM module dependency

The compiled engine comes from the [`@ad-freiburg/qlever`](https://www.npmjs.com/package/@ad-freiburg/qlever)
npm package (published from the upstream QLever repo). It ships `qlever.mjs` — an
ES module whose default export is the Emscripten factory — plus `qlever.wasm`.
`worker.ts` imports the factory directly; the module locates `qlever.wasm` and
spawns its pthread workers via `import.meta.url`, and Vite serves those assets
from `node_modules`.

To move to a newer engine, bump the dependency (`npm install @ad-freiburg/qlever@<version>`).

## Running

- `npm install` — install dependencies (fetches the WASM package from npm)
- `npm run dev` — start the Vite dev server (http://localhost:5173)
- `npm run build` — type-check and build for production

The dev server sets `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp` (see `vite.config.ts`), which are
required for the `SharedArrayBuffer` that Emscripten pthreads use.

## Notes

- The engine uses threads, so index building and querying are blocking calls; they
  run inside a Web Worker (`worker.ts`). It must be a **module** worker (`{ type:
  'module' }` in `loader.ts`) so it can `import` the ES module.
- `SharedArrayBuffer` is required (pthreads); browsers cap it at 4 GB. The page
  must therefore be cross-origin isolated — `vite.config.ts` sets the required
  COOP/COEP headers on both the dev and the preview server, and any host serving
  the production build has to send them as well.
- Objects created with `new` from the module own memory in the WebAssembly heap
  that the JS garbage collector does not free. Declare them with `using` so they
  are released when the block ends; only the long-lived `Qlever` engine is kept
  in a variable and released by hand (`destroyEngine()` in `worker.ts`).
- The module is built for wasm64, so it needs a recent browser (or Node.js >= 24,
  which is also what the package's `engines` field requires).
