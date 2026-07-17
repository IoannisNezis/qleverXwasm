/// <reference lib="webworker" />
declare const self: DedicatedWorkerGlobalScope;

import type { MainModule, Qlever, EngineConfig, IndexBuilderConfig, InputFileSpecificationVector, InputFileSpecification } from '@ad-freiburg/qlever';

// The ES module build (`-sEXPORT_ES6=1`) exposes the Emscripten factory as the
// default export. It locates `qlever.wasm` and spawns its pthread workers
// itself (as module workers) via `import.meta.url`, so this file no longer
// side-loads a global via `importScripts` and no longer needs a `locateFile`.
import createQleverModule from '@ad-freiburg/qlever';

// Emscripten now spawns its pthread pool workers pointing directly at
// `qlever.mjs` (not at this file), and that module self-bootstraps in them.
// So THIS worker only ever runs as the main instance. The guard is kept as a
// harmless safety net: were this file ever loaded in an "em-pthread" worker,
// instantiating a second module or assigning `self.onmessage` would clobber
// Emscripten's pthread handshake and hang the main instance's ready promise.
const isEmscriptenPthreadWorker = (self as any).name?.startsWith('em-pthread');

let module: MainModule | null = null;
let qleverInstance: Qlever | null = null;
let qleverEngineConfig: EngineConfig | null = null;
let qleverConfig: IndexBuilderConfig | null = null;
let qleverVec: InputFileSpecificationVector | null = null;
let qleverFileSpec: InputFileSpecification | null = null;

const moduleReady = isEmscriptenPthreadWorker ? null : createQleverModule({
  noInitialRun: true,
  print: (text: string) => self.postMessage({ type: 'log', text }),
  printErr: (text: string) => self.postMessage({ type: 'log', text }),
}).then((mod) => {
  module = mod;
});

function destroyQleverInstance(): void {
  for (const obj of [qleverInstance, qleverEngineConfig, qleverConfig, qleverVec, qleverFileSpec]) {
    if (obj) {
      try { obj.delete(); } catch (_e) { /* ignore */ }
    }
  }
  qleverInstance = null;
  qleverEngineConfig = null;
  qleverConfig = null;
  qleverVec = null;
  qleverFileSpec = null;
}

if (!isEmscriptenPthreadWorker) self.onmessage = async (e: MessageEvent) => {
  const { type, id, ...data } = e.data;

  try {
    await moduleReady;
    if (!module) throw new Error('WASM module failed to initialize');
    const m = module;

    switch (type) {
      case 'init': {
        self.postMessage({ type: 'response', id });
        break;
      }

      case 'loadDataset': {
        const { config } = data;

        const results = await Promise.all(
          config.indexFiles.map(async (filename: string) => {
            const response = await fetch(`/${filename}`);
            if (!response.ok) throw new Error(`Failed to fetch ${filename}`);
            const buffer = await response.arrayBuffer();
            return { filename, data: new Uint8Array(buffer) };
          }),
        );
        for (const file of results) {
          m.FS.writeFile(file.filename, file.data);
        }

        destroyQleverInstance();

        qleverConfig = new m.IndexBuilderConfig();
        qleverVec = new m.InputFileSpecificationVector();
        qleverFileSpec = new m.InputFileSpecification();

        qleverFileSpec.filename = config.rdfFile;
        qleverFileSpec.filetype = m.Filetype[config.filetype as keyof typeof m.Filetype]!;
        qleverConfig.baseName = config.baseName;

        qleverVec.push_back(qleverFileSpec);
        qleverConfig.inputFiles = qleverVec;

        qleverEngineConfig = new m.EngineConfig(qleverConfig);
        qleverInstance = new m.Qlever(qleverEngineConfig);

        self.postMessage({ type: 'response', id });
        break;
      }

      case 'buildIndex': {
        const { filename, fileData, filetype, baseName, settings } = data;

        m.FS.writeFile(filename, new Uint8Array(fileData));
        destroyQleverInstance();

        qleverConfig = new m.IndexBuilderConfig();
        qleverVec = new m.InputFileSpecificationVector();
        qleverFileSpec = new m.InputFileSpecification();

        qleverFileSpec.filename = filename;
        qleverFileSpec.filetype = m.Filetype[filetype as keyof typeof m.Filetype]!;
        qleverConfig.baseName = baseName;
        qleverConfig.vocabType = m.VocabularyType.InMemoryCompressed;

        // Apply memory and build settings
        if (settings?.memoryLimitMB != null) {
          qleverConfig.setMemoryLimitMB(settings.memoryLimitMB);
        }
        if (settings?.parserBufferSizeMB != null) {
          qleverConfig.setParserBufferSizeMB(settings.parserBufferSizeMB);
        }
        if (settings?.noPatterns != null) {
          qleverConfig.noPatterns = settings.noPatterns;
        }
        if (settings?.onlyPsoAndPos != null) {
          qleverConfig.onlyPsoAndPos = settings.onlyPsoAndPos;
        }
        // Write a JSON settings file for params only configurable that way
        // (num-triples-per-batch, parser-batch-size, parallel-parsing, etc.)
        if (settings?.settingsJson) {
          m.FS.writeFile('_wasm_settings.json', settings.settingsJson);
          qleverConfig.settingsFile = '_wasm_settings.json';
        }

        qleverVec.push_back(qleverFileSpec);
        qleverConfig.inputFiles = qleverVec;

        m.Qlever.buildIndex(qleverConfig);

        // Debug: list index files written to MEMFS
        try {
          const files = m.FS.readdir('.') as string[];
          const indexFiles = files.filter((f: string) => f.startsWith(baseName));
          for (const f of indexFiles) {
            const stat = (m.FS as any).stat(f);
            self.postMessage({ type: 'log', text: `[MEMFS] ${f} — ${stat.size} bytes` });
          }
          if (indexFiles.length === 0) {
            self.postMessage({ type: 'log', text: `[MEMFS] WARNING: no files matching baseName="${baseName}" found!` });
          }
          // Log the metadata and input file contents
          const meta = new TextDecoder().decode(m.FS.readFile(`${baseName}.meta-data.json`));
          self.postMessage({ type: 'log', text: `[MEMFS] meta-data.json: ${meta}` });
          const inputData = new TextDecoder().decode(m.FS.readFile(filename));
          self.postMessage({ type: 'log', text: `[MEMFS] ${filename}: ${inputData}` });
        } catch (e) {
          self.postMessage({ type: 'log', text: `[MEMFS] listing failed: ${e}` });
        }

        console.log("Creating clever instance");
        qleverEngineConfig = new m.EngineConfig(qleverConfig);
        qleverInstance = new m.Qlever(qleverEngineConfig);

        self.postMessage({ type: 'response', id });
        break;
      }

      case 'extractIndexFiles': {
        const { baseName: extractBase } = data;
        const files = m.FS.readdir('.') as string[];
        const indexFiles = files.filter((f: string) => f.startsWith(extractBase));
        const extracted: { filename: string; data: ArrayBuffer }[] = [];
        for (const f of indexFiles) {
          const bytes = m.FS.readFile(f);
          const buf = new ArrayBuffer(bytes.byteLength);
          new Uint8Array(buf).set(bytes);
          extracted.push({ filename: f, data: buf });
        }
        self.postMessage({ type: 'response', id, files: extracted }, extracted.map(e => e.data));
        break;
      }

      case 'query': {
        if (!qleverInstance) throw new Error('No dataset loaded');
        const result = qleverInstance.query(data.sparql, m.MediaType.qleverJson);
        self.postMessage({ type: 'response', id, result });
        break;
      }
    }
  } catch (error) {
    let message: string;
    if (typeof error === 'number' && module?.getExceptionMessage) {
      const [type, text] = module.getExceptionMessage(error);
      message = text || type || `WASM exception (ptr: ${error})`;
    } else {
      message = String(error);
    }
    self.postMessage({ type: 'error', id, error: message });
  }
};
