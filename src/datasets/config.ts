export interface DatasetConfig {
  baseName: string;
  rdfFile: string;
  filetype: 'NQuad' | 'Turtle';
  indexFiles: string[];
}

export const INDEX_SUFFIXES = [
  '.index.ops', '.index.ops.meta',
  '.index.osp', '.index.osp.meta',
  '.index.patterns',
  '.index.pos', '.index.pos.meta',
  '.index.pso', '.index.pso.meta',
  '.index.sop', '.index.sop.meta',
  '.index.spo', '.index.spo.meta',
  '.internal.index.pos', '.internal.index.pos.meta',
  '.internal.index.pso', '.internal.index.pso.meta',
  '.meta-data.json',
  '.vocabulary.codebooks',
  '.vocabulary.words.external',
  '.vocabulary.words.external.offsets',
  '.vocabulary.words.internal',
  '.vocabulary.words.internal.ids',
];

export const DATASET_CONFIGS: Record<string, DatasetConfig> = {
  House: {
    baseName: 'HouseIndex',
    rdfFile: 'housemd.nq',
    filetype: 'NQuad',
    indexFiles: ['housemd.nq', ...INDEX_SUFFIXES.map(s => `HouseIndex${s}`)],
  },
  Olympics: {
    baseName: 'Olympics',
    rdfFile: 'Olympics.nt.xz',
    filetype: 'Turtle',
    indexFiles: ['Olympics.nt.xz', ...INDEX_SUFFIXES.map(s => `Olympics${s}`)],
  },
  'IRI-resolution': {
    baseName: 'IRI-resolution',
    rdfFile: 'IRI-resolution.nt',
    filetype: 'Turtle',
    indexFiles: ['IRI-resolution.nt', ...INDEX_SUFFIXES.map(s => `IRI-resolution${s}`)],
  },
  TBBT: {
    baseName: 'TBBT',
    rdfFile: 'tbbt.nt',
    filetype: 'Turtle',
    indexFiles: ['tbbt.nt', ...INDEX_SUFFIXES.map(s => `TBBT${s}`)],
  },
};
