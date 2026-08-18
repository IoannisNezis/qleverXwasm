import { runQuery } from '../wasm/loader.ts';
import { renderQleverResult } from '../ui/render.ts';
import { resultContainer } from '../ui/elements.ts';

export async function executeQuery(sparql: string): Promise<void> {
  resultContainer.innerHTML =
    '<p class="text-gray-400 text-center py-8 animate-pulse">Running query...</p>';

  try {
    const queryResult = await runQuery(sparql);
    console.log(queryResult);

    console.log('query successful');
    renderQleverResult(queryResult);
  } catch (e) {
    console.error(e);
    resultContainer.innerHTML =
      `<p class="text-red-400 text-center py-8">Query failed: ${e}</p>`;
  }
}
