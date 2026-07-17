export interface InputFileSpecification {
  filename: string;
  filetype: number;
  delete(): void;
}

export interface InputFileSpecificationVector {
  push_back(spec: InputFileSpecification): void;
  delete(): void;
}

export interface IndexBuilderConfig {
  baseName: string;
  inputFiles: InputFileSpecificationVector;
  noPatterns: boolean;
  onlyPsoAndPos: boolean;
  settingsFile: string;
  vocabType: number;
  setMemoryLimitMB(mb: number): void;
  setParserBufferSizeMB(mb: number): void;
  delete(): void;
}

export interface VocabularyType {
  InMemoryUncompressed: number;
  InMemoryCompressed: number;
  OnDiskUncompressed: number;
  OnDiskCompressed: number;
  OnDiskCompressedGeoSplit: number;
}

export interface EngineConfig {
  delete(): void;
}

export interface Qlever {
  query(sparql: string, mediaType: number): string;
  delete(): void;
}

export interface QleverConstructor {
  new(engineConfig: EngineConfig): Qlever;
  buildIndex(config: IndexBuilderConfig): void;
}

export interface EmscriptenFS {
  writeFile(path: string, data: Uint8Array): void;
  readdir(path: string): string[];
  readFile(path: string): Uint8Array;
}

export type Filetype = Record<string, number>;

export interface MediaType {
  qleverJson: number;
}

export interface WasmModule {
  InputFileSpecification: new () => InputFileSpecification;
  InputFileSpecificationVector: new () => InputFileSpecificationVector;
  IndexBuilderConfig: new () => IndexBuilderConfig;
  EngineConfig: new (config: IndexBuilderConfig) => EngineConfig;
  Qlever: QleverConstructor;
  FS: EmscriptenFS;
  Filetype: Filetype;
  VocabularyType: VocabularyType;
  MediaType: MediaType;
  getExceptionMessage(ptr: number): [string, string];
}
