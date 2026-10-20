import { logContainer, clearLogBtn } from './elements.ts';
import type { LogEntry } from '../wasm/logRing.ts';

/**
 * The log panel. It keeps only the most recent lines, collapses a line that
 * repeats into a counter, and touches the DOM once per batch, so its memory and
 * its cost per update stay bounded however much the engine logs.
 */

/** Lines kept in the panel; at ~100 characters per line this is a few MB. */
const MAX_LINES = 50_000;
/**
 * Lines are grouped into block-level chunks so that appending only lays out the
 * newest chunk, and so the oldest lines can be dropped a whole chunk at a time.
 */
const CHUNK_LINES = 1_000;

interface Shown {
  node: Text;
  stamp: string;
  text: string;
  count: number;
  dropped: number;
}

/** Placeholder for the lines dropped from the top; created on first use. */
let trimmedNote: HTMLDivElement | null = null;
let trimmed = 0;
let chunk: HTMLDivElement | null = null;
let chunkLines = 0;
let total = 0;
let last: Shown | null = null;

// Formatting a time is slow enough to dominate a large batch, and a stamp only
// changes once a second, so each second is formatted once.
const timeFormat = new Intl.DateTimeFormat(undefined, { timeStyle: 'medium' });
let stampSecond = NaN;
let stampText = '';

function stamp(time: number): string {
  const second = Math.floor(time / 1000);
  if (second !== stampSecond) {
    stampSecond = second;
    stampText = `[${timeFormat.format(time)}]`;
  }
  return stampText;
}

function render(line: Shown): string {
  let text = `${line.stamp} ${line.text}`;
  if (line.count > 1) text += ` (repeated ${line.count.toLocaleString()} times)`;
  if (line.dropped > 0) {
    text +=
      ` [and ${line.dropped.toLocaleString()} more lines, dropped because` +
      ' they were logged faster than the page could take them]';
  }
  return text + '\n';
}

function dropOldestChunk(): void {
  if (!trimmedNote) {
    trimmedNote = document.createElement('div');
    trimmedNote.className = 'text-gray-500 italic';
    logContainer.prepend(trimmedNote);
  }
  const oldest = trimmedNote.nextElementSibling as HTMLElement;
  const count = oldest.childNodes.length;
  oldest.remove();
  total -= count;
  trimmed += count;
  trimmedNote.textContent = `… ${trimmed.toLocaleString()} earlier lines not kept\n`;
}

export function appendLog(entries: LogEntry[]): void {
  if (entries.length === 0) return;

  const fragment = document.createDocumentFragment();
  let changed: Shown | null = null;
  for (const entry of entries) {
    if ('dropped' in entry) {
      if (last) {
        last.dropped += entry.dropped;
        changed = last;
      } else {
        appendLog([{ time: Date.now(), text: `${entry.dropped.toLocaleString()} lines dropped` }]);
      }
      continue;
    }
    const { time, text } = entry;
    if (last && last.text === text) {
      last.count++;
      changed = last;
      continue;
    }
    if (changed) changed.node.data = render(changed);
    changed = null;

    if (!chunk || chunkLines === CHUNK_LINES) {
      if (fragment.childNodes.length > 0) chunk!.appendChild(fragment);
      chunk = document.createElement('div');
      chunkLines = 0;
      logContainer.appendChild(chunk);
    }
    last = {
      node: document.createTextNode(''),
      stamp: stamp(time),
      text,
      count: 1,
      dropped: 0,
    };
    last.node.data = render(last);
    fragment.appendChild(last.node);
    chunkLines++;
    total++;
  }
  if (chunk && fragment.childNodes.length > 0) chunk.appendChild(fragment);
  if (changed) changed.node.data = render(changed);

  while (total > MAX_LINES) dropOldestChunk();

  logContainer.scrollTop = logContainer.scrollHeight;
}

export function clearLog(): void {
  logContainer.replaceChildren();
  trimmedNote = null;
  trimmed = 0;
  chunk = null;
  chunkLines = 0;
  total = 0;
  last = null;
}

clearLogBtn.addEventListener('click', clearLog);
