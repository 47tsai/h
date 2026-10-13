import { describe, expect, it } from 'vitest';
import { formatDuration, getElapsedMs, isRunningState, localDateKey, type RunningState } from './stopwatch';

const activeState: RunningState = {
  sessionStartedAt: 1_000,
  startedAt: 5_000,
  accumulatedMs: 4_000,
  running: true,
};

describe('stopwatch time calculations', () => {
  it('calculates elapsed time from timestamps, including long background gaps', () => {
    expect(getElapsedMs(activeState, 65_000)).toBe(64_000);
  });

  it('does not add live time while paused', () => {
    expect(getElapsedMs({ ...activeState, running: false }, 65_000)).toBe(4_000);
  });

  it('does not produce negative elapsed time if the clock moves backwards', () => {
    expect(getElapsedMs(activeState, 3_000)).toBe(4_000);
  });

  it('rejects malformed persisted stopwatch states', () => {
    expect(isRunningState(activeState)).toBe(true);
    expect(isRunningState({ ...activeState, accumulatedMs: -1 })).toBe(false);
    expect(isRunningState({ ...activeState, startedAt: 500 })).toBe(false);
    expect(isRunningState({ ...activeState, running: 'yes' })).toBe(false);
    expect(isRunningState({ ...activeState, startedAt: Number.MAX_SAFE_INTEGER + 1 })).toBe(false);
    expect(isRunningState({ ...activeState, accumulatedMs: 1.5 })).toBe(false);
    expect(isRunningState(null)).toBe(false);
  });

  it('formats durations longer than a day without wrapping the hour count', () => {
    expect(formatDuration(90_061_000)).toBe('25:01:01');
  });

  it('uses the local calendar date for daily statistics', () => {
    const timestamp = new Date(2026, 9, 12, 23, 59, 59).getTime();
    expect(localDateKey(timestamp)).toBe('2026-10-12');
  });
});
