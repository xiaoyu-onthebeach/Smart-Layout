import { useAppStore } from './useAppStore';
import type { AppState } from './types';

// Only the actual banner data — never selection, tool mode, or other pure-UI state, so undo never
// feels like it "ate" a click that didn't touch anything.
const TRACKED_KEYS = ['layoutsById', 'setsById', 'pageOrder', 'pagePositions', 'pageGroups', 'pageGroupIdByPage'] as const;
type Snapshot = Pick<AppState, (typeof TRACKED_KEYS)[number]>;

function snapshot(state: AppState): Snapshot {
  const next = {} as Snapshot;
  for (const key of TRACKED_KEYS) next[key] = state[key] as never;
  return next;
}

function changed(a: Snapshot, b: Snapshot): boolean {
  return TRACKED_KEYS.some((key) => a[key] !== b[key]);
}

const MAX_HISTORY = 50;
// Coalesces a fast burst of updates (every mousemove frame of a drag, for instance) into a single
// undo step — a new checkpoint only starts once this much time has passed since the last one.
const COALESCE_MS = 500;

let history: Snapshot[] = [];
let previous: Snapshot | null = null;
let lastCheckpointAt = 0;
let restoring = false;
let started = false;

/** Starts recording data changes for undo — safe to call more than once, only the first counts. */
export function initUndoHistory() {
  if (started) return;
  started = true;
  previous = snapshot(useAppStore.getState());
  useAppStore.subscribe((state) => {
    if (restoring) return; // undo() itself triggers this subscriber — don't record it as a new change
    const next = snapshot(state);
    if (!previous || !changed(previous, next)) return;
    const now = Date.now();
    if (now - lastCheckpointAt > COALESCE_MS) {
      history.push(previous);
      if (history.length > MAX_HISTORY) history.shift();
    }
    lastCheckpointAt = now;
    previous = next;
  });
}

/** Reverts the most recent tracked change (add/move/delete an element, generate sizes, etc). */
export function undo() {
  const last = history.pop();
  if (!last) return;
  restoring = true;
  useAppStore.setState(last);
  restoring = false;
  previous = last;
  lastCheckpointAt = 0; // whatever happens next should always start its own fresh checkpoint
}
