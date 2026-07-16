interface QleverResult {
  selected: string[];
  res: string[][];
  resultSizeTotal: number;
  time: { total: string };
}

export function renderQleverResult(jsonString: string): void {
  const data: QleverResult = JSON.parse(jsonString);

  const container = document.getElementById('resultContainer')!;
  container.innerHTML = '';

  if (!data.res || data.res.length === 0) {
    container.innerHTML =
      '<p class="text-gray-400 text-center py-8">No results.</p>';
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'overflow-x-auto rounded-lg border border-gray-700';

  const table = document.createElement('table');
  table.className = 'w-full text-sm text-left';

  // Header
  const thead = document.createElement('thead');
  thead.className = 'text-xs uppercase bg-gray-800 text-green-400';
  const headerRow = document.createElement('tr');

  data.selected.forEach((col) => {
    const th = document.createElement('th');
    th.className = 'px-4 py-3';
    th.textContent = col;
    headerRow.appendChild(th);
  });

  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Body
  const tbody = document.createElement('tbody');

  data.res.forEach((row, i) => {
    const tr = document.createElement('tr');
    tr.className =
      i % 2 === 0
        ? 'bg-gray-900/50 border-b border-gray-700/50'
        : 'bg-gray-800/30 border-b border-gray-700/50';

    row.forEach((cell) => {
      const td = document.createElement('td');
      td.className = 'px-4 py-2.5';

      if (cell.startsWith('<') && cell.endsWith('>')) {
        const iri = cell.slice(1, -1);
        const a = document.createElement('a');
        a.href = iri;
        a.textContent = iri;
        a.target = '_blank';
        a.className = 'text-green-400 hover:text-green-300 hover:underline';
        td.appendChild(a);
      } else {
        td.textContent = cell;
      }

      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  wrapper.appendChild(table);
  container.appendChild(wrapper);

  const info = document.createElement('p');
  info.className = 'text-gray-400 text-sm mt-3';
  info.textContent = `Returned ${data.resultSizeTotal} results in ${data.time.total}`;
  container.appendChild(info);
}
