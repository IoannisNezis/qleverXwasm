/**
 * The engine's log travels from the worker to the page through a fixed-size ring
 * buffer in shared memory rather than as one message per line.
 *
 * `buildIndex()` and `query()` block the worker, so it cannot run timers or answer
 * messages while the engine logs. Writing into shared memory needs neither, and the
 * page reads it on its own schedule, so lines show up while the engine is still
 * busy. The ring is the backpressure: when the page falls behind, it fills up and
 * further lines are counted and dropped instead of piling up in memory without
 * bound, which is what used to freeze the browser when the engine logged in a loop.
 * The reader takes a limited number of lines per read, so the page's work per
 * update is bounded too: a burst is shown over a few updates, and only a sustained
 * flood fills the ring and loses lines.
 *
 * There is exactly one writer (the worker thread; Emscripten proxies the output of
 * its pthreads to it) and one reader (the page), which is what makes the plain
 * index handshake below safe.
 */

/** A power of two, so the free-running 32-bit positions wrap consistently. */
const CAPACITY = 4 * 1024 * 1024;
/** Longer lines are cut, so a single line can never fill the ring by itself. */
const MAX_LINE_CHARS = 100_000;
/** Lines handed out per read; rendering is what costs, at a few µs per line. */
const MAX_LINES_PER_READ = 2_000;

// Header slots, each an Int32 updated with Atomics.
const WRITE = 0; // bytes ever written, mod 2^32
const READ = 1; // bytes ever read, mod 2^32
const DROPPED = 2; // lines dropped because the ring was full, not yet in a marker
const HEADER_BYTES = 3 * Int32Array.BYTES_PER_ELEMENT;

// Record: byte length of the text (u32), timestamp (f64), UTF-8 text. A record
// with the length MARKER instead says how many lines were dropped at that point
// of the stream, carrying the count in place of the timestamp.
const RECORD_HEADER = 12;
const MARKER = 0xffffffff;

export type LogEntry =
  | {
      /** Milliseconds since the epoch, taken when the line was logged. */
      time: number;
      text: string;
    }
  | {
      /** Lines lost at this point because the ring was full. */
      dropped: number;
    };

export function createLogRing(): SharedArrayBuffer {
  return new SharedArrayBuffer(HEADER_BYTES + CAPACITY);
}

function views(buffer: SharedArrayBuffer): [Int32Array, Uint8Array] {
  return [new Int32Array(buffer, 0, 3), new Uint8Array(buffer, HEADER_BYTES, CAPACITY)];
}

export class LogRingWriter {
  private readonly header: Int32Array;
  private readonly data: Uint8Array;
  private readonly encoder = new TextEncoder();

  constructor(buffer: SharedArrayBuffer) {
    [this.header, this.data] = views(buffer);
  }

  write(text: string): void {
    if (text.length > MAX_LINE_CHARS) {
      const cut = text.length - MAX_LINE_CHARS;
      text = `${text.slice(0, MAX_LINE_CHARS)}… [${cut.toLocaleString()} characters cut]`;
    }
    const payload = this.encoder.encode(text);
    const record = new Uint8Array(RECORD_HEADER + payload.length);
    const view = new DataView(record.buffer);
    view.setUint32(0, payload.length, true);
    view.setFloat64(4, Date.now(), true);
    record.set(payload, RECORD_HEADER);

    let write = Atomics.load(this.header, WRITE) >>> 0;
    const read = Atomics.load(this.header, READ) >>> 0;
    // Lines dropped earlier are reported in front of the next line that fits, so
    // the reader learns where in the stream they went missing.
    const owed = Atomics.load(this.header, DROPPED);
    const needed = record.length + (owed > 0 ? RECORD_HEADER : 0);
    if (CAPACITY - ((write - read) >>> 0) < needed) {
      Atomics.add(this.header, DROPPED, 1);
      return;
    }

    if (owed > 0) {
      // The reader may have collected the count in the meantime; then it is 0.
      const dropped = Atomics.exchange(this.header, DROPPED, 0);
      if (dropped > 0) {
        const marker = new Uint8Array(RECORD_HEADER);
        const markerView = new DataView(marker.buffer);
        markerView.setUint32(0, MARKER, true);
        markerView.setFloat64(4, dropped, true);
        write = this.put(write, marker);
      }
    }
    write = this.put(write, record);
    // Publishing the new position is what hands the records to the reader.
    Atomics.store(this.header, WRITE, write | 0);
  }

  private put(write: number, record: Uint8Array): number {
    const start = write % CAPACITY;
    const first = Math.min(record.length, CAPACITY - start);
    this.data.set(record.subarray(0, first), start);
    this.data.set(record.subarray(first), 0);
    return (write + record.length) >>> 0;
  }
}

export class LogRingReader {
  private readonly header: Int32Array;
  private readonly data: Uint8Array;
  private readonly decoder = new TextDecoder();

  constructor(buffer: SharedArrayBuffer) {
    [this.header, this.data] = views(buffer);
  }

  /**
   * The oldest unread entries, up to a bounded number of lines; the rest stay in
   * the ring for the next call.
   */
  read(): LogEntry[] {
    const write = Atomics.load(this.header, WRITE) >>> 0;
    const read = Atomics.load(this.header, READ) >>> 0;
    const size = (write - read) >>> 0;

    // Copy out of shared memory first: TextDecoder refuses shared buffers.
    const bytes = new Uint8Array(size);
    const start = read % CAPACITY;
    const first = Math.min(size, CAPACITY - start);
    bytes.set(this.data.subarray(start, start + first));
    bytes.set(this.data.subarray(0, size - first), first);

    const view = new DataView(bytes.buffer);
    const entries: LogEntry[] = [];
    let lines = 0;
    let at = 0;
    while (at < size && lines < MAX_LINES_PER_READ) {
      const length = view.getUint32(at, true);
      const value = view.getFloat64(at + 4, true);
      at += RECORD_HEADER;
      if (length === MARKER) {
        entries.push({ dropped: value });
        continue;
      }
      entries.push({ time: value, text: this.decoder.decode(bytes.subarray(at, at + length)) });
      at += length;
      lines++;
    }
    Atomics.store(this.header, READ, (read + at) | 0);

    // Lines are only dropped while the ring is full. If nothing was written after
    // what was just read, drops not yet written as a marker came after all of it;
    // otherwise the writer puts them in a marker in front of its next line.
    if (at === size && (Atomics.load(this.header, WRITE) >>> 0) === write) {
      const dropped = Atomics.exchange(this.header, DROPPED, 0);
      if (dropped > 0) entries.push({ dropped });
    }
    return entries;
  }
}
