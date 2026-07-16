import { defineConfig } from 'vite'
import wasm from 'vite-plugin-wasm'
import tailwindcss from '@tailwindcss/vite'


export default defineConfig({
  base: '/',
  worker: {
    format: 'es'
  },
  optimizeDeps: {
    exclude: ['qlever.js']
  },
  build: {
    rollupOptions: {
      external: ['qlever.js']
    }
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


