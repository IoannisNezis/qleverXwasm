import type { DatasetConfig } from '../datasets/config.ts';

const worker = new Worker(new URL('./worker.ts', import.meta.url));

let wasmReady = false;
let nextId = 0;
const pending = new Map<number, { resolve: (value: any) => void; reject: (reason: any) => void }>();

const logContainer = document.getElementById('logContainer') as HTMLPreElement;
const clearLogBtn = document.getElementById('clearLog') as HTMLButtonElement;

function appendLog(text: string): void {
  const line = document.createElement('span');
  line.textContent = `[${new Date().toLocaleTimeString()}] ${text}\n`;
  logContainer.appendChild(line);
  logContainer.scrollTop = logContainer.scrollHeight;
}

clearLogBtn?.addEventListener('click', () => {
  logContainer.innerHTML = '';
});

worker.onmessage = (e: MessageEvent) => {
  const { type, id, error, ...rest } = e.data;
  if (type === 'log') {
    console.log('[wasm]', rest.text);
    appendLog(rest.text);
    return;
  }
  const p = pending.get(id);
  if (!p) return;
  pending.delete(id);
  if (type === 'error') {
    p.reject(new Error(error));
  } else {
    p.resolve(rest);
  }
};

function send(msg: Record<string, unknown>, transfer: Transferable[] = []): Promise<any> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ ...msg, id }, transfer);
  });
}

export async function initWasm(): Promise<void> {
  await send({ type: 'init' });
  wasmReady = true;
  console.log('WASM loaded (in worker)');
}

export function isWasmReady(): boolean {
  return wasmReady;
}

export async function loadDataset(datasetKey: string, config: DatasetConfig): Promise<void> {
  await send({ type: 'loadDataset', datasetKey, config });
}

export interface BuildIndexSettings {
  /** Memory limit for sorting/permutation building (MB). Default: ~1024 */
  memoryLimitMB?: number;
  /** Parser input buffer size (MB). Default: 10 */
  parserBufferSizeMB?: number;
  /** Skip pattern precomputation. Saves memory but limits some query types. */
  noPatterns?: boolean;
  /** Only build PSO+POS permutations (not all 6). Saves memory and time. */
  onlyPsoAndPos?: boolean;
  /**
   * JSON string for QLever's settings file mechanism. Supports:
   * - "num-triples-per-batch": triples per vocab batch (default 10000)
   * - "parser-batch-size": parser pipeline batch size (default 10000)
   * - "parallel-parsing": true/false
   * - "locale": e.g. "en_US"
   */
  settingsJson?: string;
}

export async function buildIndex(
  filename: string,
  fileData: ArrayBuffer,
  filetype: 'NQuad' | 'Turtle',
  baseName: string,
  settings?: BuildIndexSettings,
): Promise<void> {
  await send({ type: 'buildIndex', filename, fileData, filetype, baseName, settings }, [fileData]);
}

export interface IndexFile {
  filename: string;
  data: ArrayBuffer;
}

export async function extractIndexFiles(baseName: string): Promise<IndexFile[]> {
  const { files } = await send({ type: 'extractIndexFiles', baseName });
  return files;
}

export async function runQuery(sparql: string): Promise<string> {
  const { result } = await send({ type: 'query', sparql });
  return result;
}
