import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDB } from 'idb';
import { deleteStopwatchRecord, listStopwatchRecords, saveStopwatchRecord, type StopwatchRecord } from './storage';

const sample = (overrides: Partial<StopwatchRecord> = {}): StopwatchRecord => ({
  id: 'record-1',
  startedAt: 1_000,
  endedAt: 6_000,
  durationMs: 5_000,
  title: '2026/10/12 10:00:00',
  createdAt: 6_000,
  ...overrides,
});

async function clearRecords() {
  const db = await openDB('h-tools', 1);
  await db.clear('stopwatch-records');
  db.close();
}

beforeEach(clearRecords);
afterEach(clearRecords);

describe('IndexedDB stopwatch records', () => {
  it('saves and reads records newest first', async () => {
    await saveStopwatchRecord(sample({ id: 'older', createdAt: 10 }));
    await saveStopwatchRecord(sample({ id: 'newer', createdAt: 20 }));

    const records = await listStopwatchRecords();
    expect(records.map((record) => record.id)).toEqual(['newer', 'older']);
  });

  it('updates a record with the same ID instead of duplicating it', async () => {
    await saveStopwatchRecord(sample({ title: 'first version' }));
    await saveStopwatchRecord(sample({ title: 'updated version', durationMs: 9_000 }));

    const records = await listStopwatchRecords();
    expect(records).toHaveLength(1);
    expect(records[0].title).toBe('updated version');
    expect(records[0].durationMs).toBe(9_000);
  });

  it('deletes only the selected record', async () => {
    await saveStopwatchRecord(sample({ id: 'keep' }));
    await saveStopwatchRecord(sample({ id: 'remove', createdAt: 7_000 }));
    await deleteStopwatchRecord('remove');

    const records = await listStopwatchRecords();
    expect(records.map((record) => record.id)).toEqual(['keep']);
  });

  it('preserves timestamps and elapsed duration as stored values', async () => {
    const record = sample({ startedAt: 123, endedAt: 456_789, durationMs: 456_666 });
    await saveStopwatchRecord(record);

    expect(await listStopwatchRecords()).toEqual([record]);
  });
});
