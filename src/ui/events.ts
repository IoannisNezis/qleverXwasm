import {
  input,
  queryButton,
  indexFileInput,
  filetypeSelect,
  buildIndexBtn,
  indexTextInput,
  downloadIndexBtn,
  resultContainer,
} from './elements.ts';
import { buildIndex, extractIndexFiles } from '../wasm/loader.ts';
import { executeQuery } from '../engine/executor.ts';
import { blockedReason, refreshControls, setAppState, setBuildDetail } from './state.ts';

let lastBuiltBaseName: string | null = null;

function reportToBuild(reason: string): void {
  setBuildDetail(reason, 'warn');
}

function reportToResults(reason: string): void {
  resultContainer.innerHTML = `<p class="text-yellow-400 text-center py-8">${reason}</p>`;
}

/** Refuse a gated action and say why, so a click is never a silent no-op. */
function refused(button: HTMLElement, report: (reason: string) => void): boolean {
  const reason = blockedReason(button);
  if (reason) report(reason);
  return reason !== null;
}

async function runQuery(): Promise<void> {
  if (refused(queryButton, reportToResults)) return;

  // Claim the engine before awaiting, so a second trigger is refused rather than
  // silently queued behind the running query.
  setAppState('querying');
  try {
    await executeQuery(input.value);
  } finally {
    setAppState('queryable');
  }
}

async function runBuild(): Promise<void> {
  if (refused(buildIndexBtn, reportToBuild)) return;

  const file = indexFileInput.files?.[0];
  const text = indexTextInput.value.trim();
  const filetype = filetypeSelect.value as 'NQuad' | 'Turtle';
  const filename = file ? file.name : filetype === 'NQuad' ? 'input.nq' : 'input.nt';
  const baseName = filename.replace(/\.[^.]+$/, '');
  const source = file ? file.name : 'pasted data';

  // Claim the engine before reading the file, which is itself an await.
  setBuildDetail(`Building index from ${source}...`, 'info');
  setAppState('building');

  try {
    const fileData = file ? await file.arrayBuffer() : new TextEncoder().encode(text).buffer;
    await buildIndex(filename, fileData, filetype, baseName, {
      memoryLimitMB: 1024 * 4,
      noPatterns: true,
      onlyPsoAndPos: false,
      // The parallel Turtle parser is prone to deadlocks under the WASM
      // pthread pool, so force the single-threaded parser.
      settingsJson: JSON.stringify({ 'parallel-parsing': false }),
    });
    lastBuiltBaseName = baseName;
    setBuildDetail(`Index built from ${source}.`, 'ok');
    setAppState('queryable');
  } catch (e) {
    console.error('Failed to build index:', e);
    setBuildDetail(`Failed to build index: ${e}`, 'error');
    // The build wiped any previous engine, so there is nothing to query or
    // download now.
    lastBuiltBaseName = null;
    setAppState('ready');
  }
}

async function runExtract(): Promise<void> {
  if (refused(downloadIndexBtn, reportToBuild)) return;
  if (!lastBuiltBaseName) return;

  setAppState('extracting');
  downloadIndexBtn.textContent = 'Extracting...';
  try {
    const files = await extractIndexFiles(lastBuiltBaseName);
    for (const file of files) {
      const blob = new Blob([file.data]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.filename;
      a.click();
      URL.revokeObjectURL(url);
    }
    setBuildDetail(`Downloaded ${files.length} index files.`, 'ok');
  } catch (e) {
    console.error('Failed to extract index files:', e);
    setBuildDetail(`Failed to extract files: ${e}`, 'error');
  } finally {
    downloadIndexBtn.textContent = 'Download Index Files';
    setAppState('queryable');
  }
}

export function initApp(): void {
  // Keep the gating in step with what has actually been entered.
  for (const el of [indexFileInput, indexTextInput]) {
    el.addEventListener('input', refreshControls);
    el.addEventListener('change', refreshControls);
  }
  input.addEventListener('input', refreshControls);

  queryButton.addEventListener('click', runQuery);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.ctrlKey) {
      event.preventDefault();
      runQuery();
    }
  });

  buildIndexBtn.addEventListener('click', runBuild);
  downloadIndexBtn.addEventListener('click', runExtract);

  refreshControls();
}
