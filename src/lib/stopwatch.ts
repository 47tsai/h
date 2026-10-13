export interface RunningState {
  sessionStartedAt: number;
  startedAt: number;
  accumulatedMs: number;
  running: boolean;
}

export function isRunningState(value: unknown): value is RunningState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<RunningState>;
  return Number.isSafeInteger(state.sessionStartedAt) &&
    Number.isSafeInteger(state.startedAt) &&
    Number.isSafeInteger(state.accumulatedMs) &&
    typeof state.running === 'boolean' &&
    (state.sessionStartedAt as number) > 0 &&
    (state.startedAt as number) >= (state.sessionStartedAt as number) &&
    (state.accumulatedMs as number) >= 0;
}

/** Calculate from timestamps so background tabs and device sleep do not lose elapsed time. */
export function getElapsedMs(state: RunningState | null, now: number): number {
  if (!state) return 0;
  const liveSegment = state.running ? Math.max(0, now - state.startedAt) : 0;
  return state.accumulatedMs + liveSegment;
}

export function formatDuration(milliseconds: number): string {
  const safeMilliseconds = Number.isFinite(milliseconds) ? Math.max(0, milliseconds) : 0;
  const total = Math.floor(safeMilliseconds / 1000);
  return [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60]
    .map((value) => String(value).padStart(2, '0')).join(':');
}

/** Date key in the viewer's local timezone, matching the history page's daily stats. */
export function localDateKey(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
