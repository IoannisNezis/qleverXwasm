import { runQuery } from '../wasm/loader.ts';
import { renderQleverResult } from '../ui/render.ts';

export async function executeQuery(sparql: string): Promise<void> {
  if (!sparql.trim()) {
    showError('No query entered!');
    return;
  }

  const resultContainer = document.getElementById('resultContainer')!;
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

function showError(message: string): void {
  const resultContainer = document.getElementById('resultContainer')!;
  resultContainer.innerHTML =
    `<p class="text-yellow-400 text-center py-8">${message}</p>`;
}
