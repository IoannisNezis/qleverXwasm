import { loadDataset } from '../wasm/loader.ts';
import { DATASET_CONFIGS } from './config.ts';

export async function loadQleverDataset(datasetKey: string): Promise<void> {
  const dsConfig = DATASET_CONFIGS[datasetKey];
  if (!dsConfig) {
    throw new Error(`Unknown dataset: ${datasetKey}`);
  }
  await loadDataset(datasetKey, dsConfig);
}
