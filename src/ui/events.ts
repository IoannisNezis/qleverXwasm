import { input, queryButton, indexFileInput, filetypeSelect, buildIndexBtn, buildIndexStatus, indexTextInput, downloadIndexBtn } from './elements.ts';
import { isWasmReady, buildIndex, extractIndexFiles } from '../wasm/loader.ts';
import { executeQuery } from '../engine/executor.ts';

let indexReady = false;
let lastBuiltBaseName: string | null = null;

export function initApp(): void {
  // Run query button
  queryButton.addEventListener('click', () => {
    if (!indexReady) {
      const resultContainer = document.getElementById('resultContainer')!;
      resultContainer.innerHTML =
        '<p class="text-yellow-400 text-center py-8">No index available! Please build an index first.</p>';
      return;
    }
    executeQuery(input.value);
  });

  // Ctrl+Enter to run query
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.ctrlKey) {
      event.preventDefault();
      if (indexReady) {
        executeQuery(input.value);
      }
    }
  });

  // Build index from file or text
  buildIndexBtn.addEventListener('click', async () => {
    const file = indexFileInput.files?.[0];
    const text = indexTextInput.value.trim();

    if (!file && !text) {
      buildIndexStatus.textContent = 'Please upload a file or paste RDF data.';
      buildIndexStatus.className = 'text-sm text-yellow-400';
      return;
    }

    if (!isWasmReady()) {
      buildIndexStatus.textContent = 'WASM still loading...';
      buildIndexStatus.className = 'text-sm text-red-400';
      return;
    }

    const filetype = filetypeSelect.value as 'NQuad' | 'Turtle';
    let filename: string;
    let fileData: ArrayBuffer;

    if (file) {
      filename = file.name;
      fileData = await file.arrayBuffer();
    } else {
      filename = filetype === 'NQuad' ? 'input.nq' : 'input.nt';
      fileData = new TextEncoder().encode(text).buffer;
    }

    const baseName = filename.replace(/\.[^.]+$/, '');
    const source = file ? file.name : 'pasted data';

    buildIndexStatus.textContent = `Building index from ${source}...`;
    buildIndexStatus.className = 'text-sm text-gray-400 animate-pulse';
    buildIndexBtn.disabled = true;
    downloadIndexBtn.classList.add('hidden');
    indexReady = false;

    try {
      await buildIndex(filename, fileData, filetype, baseName, {
        memoryLimitMB: 1024 * 4,
        noPatterns: true,
        onlyPsoAndPos: false,
        // The parallel Turtle parser is prone to deadlocks under the WASM
        // pthread pool, so force the single-threaded parser.
        settingsJson: JSON.stringify({ 'parallel-parsing': false }),
      });
      indexReady = true;
      lastBuiltBaseName = baseName;
      buildIndexStatus.textContent = `Index built from ${source} — ready to query.`;
      buildIndexStatus.className = 'text-sm text-green-400';
      downloadIndexBtn.classList.remove('hidden');
    } catch (e) {
      console.error('Failed to build index:', e);
      buildIndexStatus.textContent = `Failed to build index: ${e}`;
      buildIndexStatus.className = 'text-sm text-red-400';
    } finally {
      buildIndexBtn.disabled = false;
    }
  });

  // Download index files
  downloadIndexBtn.addEventListener('click', async () => {
    if (!lastBuiltBaseName) return;
    downloadIndexBtn.disabled = true;
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
    } catch (e) {
      console.error('Failed to extract index files:', e);
      buildIndexStatus.textContent = `Failed to extract files: ${e}`;
      buildIndexStatus.className = 'text-sm text-red-400';
    } finally {
      downloadIndexBtn.disabled = false;
      downloadIndexBtn.textContent = 'Download Index Files';
    }
  });
}
