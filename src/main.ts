import './style.css';
import { initWasm } from './wasm/loader.ts';
import { initApp } from './ui/events.ts';
import { setAppState } from './ui/state.ts';

// Wire up and gate the UI first, so the engine's outcome only has to flip a state.
initApp();

initWasm().then(
  () => setAppState('ready'),
  (e: unknown) => {
    console.error('Failed to initialize the engine:', e);
    setAppState('failed', e instanceof Error ? e.message : String(e));
  },
);
