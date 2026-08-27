import {
  input,
  queryButton,
  indexFileInput,
  filetypeSelect,
  buildIndexBtn,
  buildIndexStatus,
  clearFileBtn,
  indexTextInput,
  downloadIndexBtn,
  engineStatus,
} from './elements.ts';

/**
 * Single source of truth for what the user is allowed to do. Every control is
 * derived from the current state, so a control can never be left enabled for an
 * action that would fail.
 *
 * The engine runs one blocking job at a time, so every long-running job gets its
 * own state rather than an ad-hoc "busy" flag next to it.
 */
export type AppState =
  | 'loading' // engine is still being fetched and instantiated
  | 'failed' // engine cannot be used at all
  | 'ready' // engine up, no index yet
  | 'building' // index build in progress; the engine is blocked
  | 'queryable' // index built, queries can run
  | 'querying' // query in progress; the engine is blocked
  | 'extracting'; // index files being read out of the in-memory filesystem

/** Status-line styles. `loading` is the only one that pulses. */
export type Tone = 'loading' | 'info' | 'ok' | 'warn' | 'error';

const TONES: Record<Tone, string> = {
  loading: 'text-sm text-gray-400 animate-pulse',
  info: 'text-sm text-gray-400',
  ok: 'text-sm text-green-400',
  warn: 'text-sm text-yellow-400',
  error: 'text-sm text-red-400',
};

interface StateSpec {
  status: string;
  tone: Tone;
  /** Reason the build inputs are unusable, or null when they are usable. */
  buildInput: string | null;
  buildAction: string | null;
  queryInput: string | null;
  queryAction: string | null;
  download: string | null;
}

const ENGINE_LOADING = 'The SPARQL engine is still loading.';
const ENGINE_FAILED = 'The SPARQL engine failed to load.';
const NO_INDEX = 'No index has been built yet.';
const BUILD_RUNNING = 'An index build is in progress.';
const WAIT_BUILD = 'Wait for the index build to finish.';
const WAIT_QUERY = 'Wait for the running query to finish.';
const WAIT_EXTRACT = 'Wait for the index files to finish extracting.';

// Entering RDF or query text never breaks anything, so data entry stays open in
// every state where the engine might still be usable. Only the actions are gated.
const STATES: Record<AppState, StateSpec> = {
  loading: {
    status: 'Loading the SPARQL engine — you can already prepare your data and query.',
    tone: 'loading',
    buildInput: null,
    buildAction: ENGINE_LOADING,
    queryInput: null,
    queryAction: ENGINE_LOADING,
    download: NO_INDEX,
  },
  failed: {
    // Replaced by the concrete failure reason in setAppState().
    status: ENGINE_FAILED,
    tone: 'error',
    buildInput: ENGINE_FAILED,
    buildAction: ENGINE_FAILED,
    queryInput: ENGINE_FAILED,
    queryAction: ENGINE_FAILED,
    download: ENGINE_FAILED,
  },
  ready: {
    status: 'Engine ready — upload or paste RDF data, then build an index.',
    tone: 'ok',
    buildInput: null,
    buildAction: null,
    queryInput: null,
    queryAction: 'Build an index first — there is nothing to query yet.',
    download: NO_INDEX,
  },
  building: {
    status: 'Building the index — this blocks the engine until it finishes.',
    tone: 'loading',
    buildInput: BUILD_RUNNING,
    buildAction: BUILD_RUNNING,
    queryInput: null,
    queryAction: WAIT_BUILD,
    download: WAIT_BUILD,
  },
  queryable: {
    status: 'Index ready — run a SPARQL query.',
    tone: 'ok',
    buildInput: null,
    buildAction: null,
    queryInput: null,
    queryAction: null,
    download: null,
  },
  querying: {
    status: 'Running the query — this blocks the engine until it finishes.',
    tone: 'loading',
    buildInput: null,
    buildAction: WAIT_QUERY,
    queryInput: null,
    queryAction: 'A query is already running.',
    download: WAIT_QUERY,
  },
  extracting: {
    status: 'Extracting the index files.',
    tone: 'loading',
    buildInput: null,
    buildAction: WAIT_EXTRACT,
    queryInput: null,
    queryAction: WAIT_EXTRACT,
    download: 'The index files are already being extracted.',
  },
};

const BLOCKED_CLASSES = ['opacity-50', 'cursor-not-allowed'] as const;

let current: AppState = 'loading';
let failureReason: string | null = null;

/**
 * Action buttons keep `aria-disabled` rather than the `disabled` attribute: that
 * leaves them in the tab order, lets assistive technology announce that they are
 * unavailable, and keeps the hover tooltip working — browsers suppress tooltips
 * on natively disabled controls. The click handlers refuse the action instead.
 */
function gateAction(el: HTMLElement, reason: string | null): void {
  el.setAttribute('aria-disabled', String(reason !== null));
  for (const c of BLOCKED_CLASSES) el.classList.toggle(c, reason !== null);
  if (reason) {
    el.title = reason;
    el.dataset.blockedReason = reason;
  } else {
    el.removeAttribute('title');
    delete el.dataset.blockedReason;
  }
}

/**
 * Data entry is only closed off when typing cannot lead anywhere, and then it has
 * to be really disabled to stop the keystrokes. The reason is always mirrored in
 * the status line, because a tooltip on a disabled field reaches nobody on a
 * keyboard or a touch screen.
 */
function gateInput(
  el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  reason: string | null,
): void {
  el.disabled = reason !== null;
  for (const c of BLOCKED_CLASSES) el.classList.toggle(c, reason !== null);
  if (reason) el.title = reason;
  else el.removeAttribute('title');
}

/** The reason an action is unavailable, or null when it may proceed. */
export function blockedReason(el: HTMLElement): string | null {
  return el.dataset.blockedReason ?? null;
}

/**
 * Detail about the current build or extraction that the state itself cannot know:
 * which file it came from, or the text of a failure. The state owns the phase and
 * the header line; this owns the specifics.
 */
export function setBuildDetail(text: string, tone: Tone): void {
  buildIndexStatus.textContent = text;
  buildIndexStatus.className = TONES[tone];
}

function hasFile(): boolean {
  return (indexFileInput.files?.length ?? 0) > 0;
}

function hasBuildData(): boolean {
  return hasFile() || indexTextInput.value.trim().length > 0;
}

/** Re-derive every control from the current state. Cheap and idempotent. */
export function refreshControls(): void {
  const spec = STATES[current];

  engineStatus.textContent = current === 'failed' && failureReason ? failureReason : spec.status;
  engineStatus.className = TONES[spec.tone];

  gateInput(indexFileInput, spec.buildInput);
  gateInput(filetypeSelect, spec.buildInput);
  gateInput(input, spec.queryInput);

  // A selected file takes precedence over pasted data, so say so on the box it
  // overrides instead of letting the user type into something that is ignored.
  gateInput(
    indexTextInput,
    spec.buildInput ??
      (hasFile() ? 'The selected file will be indexed — clear it to paste data instead.' : null),
  );

  // Empty-input checks live here too, so the button is never clickable in a state
  // that would only produce a validation error.
  gateAction(
    buildIndexBtn,
    spec.buildAction ?? (hasBuildData() ? null : 'Upload a file or paste RDF data first.'),
  );
  gateAction(
    queryButton,
    spec.queryAction ?? (input.value.trim() ? null : 'Enter a SPARQL query first.'),
  );
  gateAction(downloadIndexBtn, spec.download);
  gateAction(clearFileBtn, spec.buildInput ?? (hasFile() ? null : 'No file is selected.'));
}

export function setAppState(next: AppState, reason?: string): void {
  current = next;
  failureReason = reason ?? null;
  refreshControls();
}
