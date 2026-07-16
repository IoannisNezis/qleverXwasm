# QLever to WebAssembly

QLever (SPARQL engine) compiled to WebAssembly via Emscripten, served as a local web app.

## Project structure

- `src/` — TypeScript frontend (Vite + Tailwind)
  - `wasm/worker.ts` — Web Worker that loads and runs the WASM module
  - `wasm/loader.ts` — Main-thread API that communicates with the worker
  - `ui/` — UI event handlers
  - `datasets/` — Dataset configuration
- `modified_qlever_files/` — Modified QLever source files copied into the upstream tree at build time
  - `CMakeLists.txt` — Emscripten link flags (pthreads, memory, assertions)
  - `Qlever.cpp` — QLever entry point with embind bindings
  - `emscripten.profile` — Conan profile for cross-compiling to WASM
- `public/` — Built WASM artifacts (`qlever.js`, `qlever.wasm`)
- `justfile` — Build orchestration
- `QLEVER_PATCHES.md` — Documents all upstream QLever source patches and their rationale

## Build system

Uses `just` for build orchestration. The upstream QLever repo is at `~/code/qlever`.

| Command | What it does |
|---------|-------------|
| `just build` | Full build: copy-files, patch-sources, install (conan), configure (cmake), compile, deploy |
| `just rebuild` | Quick rebuild: compile + deploy (only re-links, no reconfigure) |
| `just copy-files configure rebuild` | Use when CMakeLists.txt or emscripten.profile changed (needs reconfigure) |
| `just build` | Use when upstream patches (sed rules) changed |

**Key distinction**: `just rebuild` skips `configure`, so changes to CMakeLists.txt linker flags require at least `just copy-files configure compile deploy`.

## WASM memory model

- Initial memory: 64MB, grows on demand up to MAXIMUM_MEMORY (set in emscripten.profile)
- SharedArrayBuffer is required (pthreads) — browsers cap this at 4GB
- Emscripten's `mmap()` allocates real memory (copies data), so mmap'd VFS files exist twice in heap
- See `QLEVER_PATCHES.md` for all memory-related constant patches
