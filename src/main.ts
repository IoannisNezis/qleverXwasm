import './style.css';
import { initWasm } from './wasm/loader.ts';
import { initApp } from './ui/events.ts';

initWasm();
initApp();
