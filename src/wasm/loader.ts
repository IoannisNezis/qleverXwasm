import { LogRingReader } from './logRing.ts';
import { appendLog } from '../ui/log.ts';

// Must be a module worker: worker.ts now `import`s the Emscripten ES module,
// which a classic worker cannot do (it would fail to evaluate and hang the
// module's ready promise forever).
const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });

// A worker that failed to load will never answer, so reject everything it owes us
// instead of leaving the caller pending forever.
worker.onerror = (e) => {
  console.error('[wasm worker] failed to load:', e.message || e);
  rejectAllPending(
    new Error(`The engine worker could not be started: ${e.message || 'unknown error'}`),
  );
};

let nextId = 0;
const pending = new Map<number, { resolve: (value: any) => void; reject: (reason: any) => void }>();

/** Reads the worker's log; the worker announces its ring right after it starts. */
let logReader: LogRingReader | null = null;

function drainLog(): void {
  if (logReader) appendLog(logReader.read());
}

// Polled rather than pushed: the worker cannot post anything while the engine
// blocks it, but it can keep writing to the ring.
setInterval(drainLog, 50);

worker.onmessage = (e: MessageEvent) => {
  const { type, id, error, ...rest } = e.data;
  if (type === 'logRing') {
    logReader = new LogRingReader(rest.buffer);
    return;
  }
  // Show what the job logged before reporting its outcome.
  drainLog();
  const p = pending.get(id);
  if (!p) return;
  pending.delete(id);
  if (type === 'error') {
    p.reject(new Error(error));
  } else {
    p.resolve(rest);
  }
};

function rejectAllPending(error: Error): void {
  for (const p of pending.values()) p.reject(error);
  pending.clear();
}

function send(msg: Record<string, unknown>, transfer: Transferable[] = []): Promise<any> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ ...msg, id }, transfer);
  });
}

export async function initWasm(): Promise<void> {
  if (!crossOriginIsolated || typeof SharedArrayBuffer === 'undefined') {
    throw new Error(
      'This page is not cross-origin isolated, so the engine cannot use the ' +
        'SharedArrayBuffer its threads need. Serve it with the headers ' +
        'Cross-Origin-Opener-Policy: same-origin and ' +
        'Cross-Origin-Embedder-Policy: require-corp.',
    );
  }
  await send({ type: 'init' });
  console.log('WASM loaded (in worker)');
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
