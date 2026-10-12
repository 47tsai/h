import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDB } from 'idb';
import {
  deleteFavorite,
  deleteStopwatchRecord,
  listFavorites,
  listStopwatchRecords,
  saveFavorite,
  saveStopwatchRecord,
  type FavoriteItem,
  type StopwatchRecord,
} from './storage';

const sampleRecord = (overrides: Partial<StopwatchRecord> = {}): StopwatchRecord => ({
  id: 'record-1',
  startedAt: 1_000,
  endedAt: 6_000,
  durationMs: 5_000,
  title: '2026/10/12 10:00:00',
  createdAt: 6_000,
  ...overrides,
});

const sampleFavorite = (overrides: Partial<FavoriteItem> = {}): FavoriteItem => ({
  id: 'favorite-1',
  url: 'https://example.com/item/123',
  title: 'Example item',
  createdAt: 10,
  updatedAt: 10,
  ...overrides,
});

async function clearDatabase() {
  const db = await openDB('h-tools', 2);
  await Promise.all([db.clear('stopwatch-records'), db.clear('favorites')]);
  db.close();
}

beforeEach(clearDatabase);
afterEach(clearDatabase);

describe('IndexedDB stopwatch records', () => {
  it('saves and reads records newest first', async () => {
    await saveStopwatchRecord(sampleRecord({ id: 'older', createdAt: 10 }));
    await saveStopwatchRecord(sampleRecord({ id: 'newer', createdAt: 20 }));

    expect((await listStopwatchRecords()).map((record) => record.id)).toEqual(['newer', 'older']);
  });

  it('updates a record with the same ID instead of duplicating it', async () => {
    await saveStopwatchRecord(sampleRecord({ title: 'first version' }));
    await saveStopwatchRecord(sampleRecord({ title: 'updated version', durationMs: 9_000 }));

    const records = await listStopwatchRecords();
    expect(records).toHaveLength(1);
    expect(records[0].title).toBe('updated version');
    expect(records[0].durationMs).toBe(9_000);
  });

  it('deletes only the selected record', async () => {
    await saveStopwatchRecord(sampleRecord({ id: 'keep' }));
    await saveStopwatchRecord(sampleRecord({ id: 'remove', createdAt: 7_000 }));
    await deleteStopwatchRecord('remove');

    expect((await listStopwatchRecords()).map((record) => record.id)).toEqual(['keep']);
  });

  it('preserves timestamps and elapsed duration as stored values', async () => {
    const record = sampleRecord({ startedAt: 123, endedAt: 456_789, durationMs: 456_666 });
    await saveStopwatchRecord(record);
    expect(await listStopwatchRecords()).toEqual([record]);
  });
});

describe('IndexedDB favorites', () => {
  it('saves and lists favorites newest first', async () => {
    await saveFavorite(sampleFavorite({ id: 'older', createdAt: 10 }));
    await saveFavorite(sampleFavorite({ id: 'newer', createdAt: 20, title: 'Newest' }));

    expect((await listFavorites()).map((item) => item.id)).toEqual(['newer', 'older']);
  });

  it('updates an existing favorite and preserves notes', async () => {
    await saveFavorite(sampleFavorite({ notes: 'old note' }));
    await saveFavorite(sampleFavorite({ title: 'Updated title', notes: 'useful note', updatedAt: 30 }));

    const favorites = await listFavorites();
    expect(favorites).toHaveLength(1);
    expect(favorites[0].title).toBe('Updated title');
    expect(favorites[0].notes).toBe('useful note');
  });

  it('deletes a favorite without touching stopwatch records', async () => {
    await saveFavorite(sampleFavorite());
    await saveStopwatchRecord(sampleRecord());
    await deleteFavorite('favorite-1');

    expect(await listFavorites()).toEqual([]);
    expect(await listStopwatchRecords()).toHaveLength(1);
  });
});
