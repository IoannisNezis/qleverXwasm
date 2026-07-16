import { input, queryButton, queryOptions, datasetSelect, statusIndicator, indexFileInput, filetypeSelect, buildIndexBtn, buildIndexStatus, indexTextInput, downloadIndexBtn } from './elements.ts';
import { isWasmReady, buildIndex, extractIndexFiles } from '../wasm/loader.ts';
import { loadQleverDataset } from '../datasets/loader.ts';
import { DATASET_CONFIGS } from '../datasets/config.ts';
import { PRESET_QUERIES } from '../queries/presets.ts';
import { executeQuery } from '../engine/executor.ts';

let datasetLoaded = false;
let lastBuiltBaseName: string | null = null;

function setStatus(text: string, type: 'info' | 'success' | 'error' = 'info'): void {
  const colors = {
    info: 'text-gray-400',
    success: 'text-green-400',
    error: 'text-red-400',
  };
  statusIndicator.textContent = text;
  statusIndicator.className = `text-sm ${colors[type]}`;
}

function populateQueryDropdown(datasetKey: string): void {
  queryOptions.innerHTML = '<option value="">-- Select a query --</option>';

  const filtered = PRESET_QUERIES.filter((q) => q.datasets.includes(datasetKey));

  filtered.forEach((q) => {
    const option = document.createElement('option');
    option.value = q.id;
    option.textContent = q.label;
    queryOptions.appendChild(option);
  });
}

export function initApp(): void {
  // Dataset selection
  datasetSelect.addEventListener('change', async () => {
    const selected = datasetSelect.value;
    if (!selected) return;

    if (!isWasmReady()) {
      setStatus('WASM still loading...', 'error');
      return;
    }

    const dsConfig = DATASET_CONFIGS[selected];
    if (!dsConfig) {
      setStatus('Please select a valid index!', 'error');
      return;
    }

    setStatus(`Loading ${selected} dataset...`, 'info');
    populateQueryDropdown(selected);
    datasetLoaded = false;

    try {
      await loadQleverDataset(selected);
      datasetLoaded = true;
      setStatus(`${selected} dataset ready`, 'success');
    } catch (e) {
      console.error(`Failed to load dataset ${selected}:`, e);
      setStatus(`Failed to load dataset: ${e}`, 'error');
    }
  });

  // Run query button
  queryButton.addEventListener('click', () => {
    if (!datasetLoaded) {
      const resultContainer = document.getElementById('resultContainer')!;
      resultContainer.innerHTML =
        '<p class="text-yellow-400 text-center py-8">No dataset loaded! Please select an index first.</p>';
      return;
    }
    executeQuery(input.value);
  });

  // Ctrl+Enter to run query
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.ctrlKey) {
      event.preventDefault();
      if (datasetLoaded) {
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
    datasetLoaded = false;

    try {
      await buildIndex(filename, fileData, filetype, baseName, {
        memoryLimitMB: 1024 * 4,
        noPatterns: true,
        onlyPsoAndPos: false,
        // Bottleneck #2: the parallel Turtle parser deadlocks under WASM pthreads.
        // Force the single-threaded parser. See BOTTLENECKS.md#bottleneck-2.
        settingsJson: JSON.stringify({ 'parallel-parsing': false }),
      });
      datasetLoaded = true;
      lastBuiltBaseName = baseName;
      buildIndexStatus.textContent = `Index built from ${source} — ready to query.`;
      buildIndexStatus.className = 'text-sm text-green-400';
      setStatus('Custom index ready', 'success');
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

  // Query preset selection
  queryOptions.addEventListener('change', () => {
    const selectedId = queryOptions.value;
    if (!selectedId) return;

    const preset = PRESET_QUERIES.find((q) => q.id === selectedId);
    if (preset) {
      input.value = preset.sparql;
    }
  });
}
