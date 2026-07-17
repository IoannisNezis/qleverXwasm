import { defineConfig } from 'vite'
import wasm from 'vite-plugin-wasm'
import tailwindcss from '@tailwindcss/vite'


export default defineConfig({
  base: '/',
  worker: {
    format: 'es'
  },
  // Keep the Emscripten glue out of esbuild's dep pre-bundling: rewriting it
  // would break the `import.meta.url` that the module uses to locate
  // `qlever.wasm` and to spawn its pthread workers. Vite/vite-plugin-wasm
  // resolve and emit those assets from the package instead.
  optimizeDeps: {
    exclude: ['@ad-freiburg/qlever']
  },
  server: {
    port: 5173,
    headers: {
      // Required for Emscripten pthreads in the browser
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  plugins: [wasm(), tailwindcss()],
});


