# QLever to WebAssembly

QLever (SPARQL engine) compiled to WebAssembly via Emscripten, served as a local web app.

## Project structure

- `src/` — TypeScript frontend (Vite + Tailwind)
  - `wasm/worker.ts` — module Web Worker that loads and runs the WASM module
  - `wasm/loader.ts` — main-thread API that communicates with the worker
  - `ui/` — UI event handlers and rendering
  - `datasets/` — dataset configuration and loading
- `public/` — static web root; serves the dataset files fetched at runtime
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
- `SharedArrayBuffer` is required (pthreads); browsers cap it at 4 GB.
- The module is built for wasm64, so it needs a recent browser.
