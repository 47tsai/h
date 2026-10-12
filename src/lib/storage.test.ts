import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDB } from 'idb';
import {
  deleteFavorite,
  deleteStopwatchRecord,
  importBackupData,
  listFavorites,
  listStopwatchRecords,
  listResultHistory,
  listSyncTombstones,
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
  // Let the production storage module create and migrate the current schema before cleanup.
  await listStopwatchRecords();
  const db = await openDB('h-tools', 4);
  await Promise.all([
    db.clear('stopwatch-records'),
    db.clear('favorites'),
    db.clear('result-history'),
    db.clear('sync-tombstones'),
  ]);
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
  it('keeps deletion tombstones increasing if the system clock moves backwards', async () => {
    await saveFavorite(sampleFavorite());
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValueOnce(1_000).mockReturnValueOnce(500);
    try {
      await deleteFavorite('favorite-1');
      await deleteFavorite('favorite-1');
    } finally {
      now.mockRestore();
    }

    const tombstone = (await listSyncTombstones()).find((item) => item.key === 'favorites:favorite-1');
    expect(tombstone?.deletedAt).toBe(1_001);
  });

});

describe('atomic backup import', () => {
  it('imports records and favorites and clears tombstones for restored entries', async () => {
    const record = sampleRecord();
    const favorite = sampleFavorite();
    await saveFavorite(favorite);
    await deleteFavorite(favorite.id);
    expect((await listSyncTombstones()).some((item) => item.key === `favorites:${favorite.id}`)).toBe(true);

    await importBackupData([record], [], [favorite]);

    expect((await listStopwatchRecords()).map((item) => item.id)).toEqual([record.id]);
    expect((await listFavorites()).map((item) => item.id)).toEqual([favorite.id]);
    expect((await listSyncTombstones()).some((item) => item.key === `favorites:${favorite.id}`)).toBe(false);
  });

  it('rejects invalid entries before writing any imported records', async () => {
    const valid = sampleRecord({ id: 'should-roll-back' });
    const invalid = { title: 'missing ID' } as unknown as StopwatchRecord;

    await expect(importBackupData([valid, invalid], [], [])).rejects.toBeTruthy();
    expect(await listStopwatchRecords()).toEqual([]);
  });

  it('rejects malformed fields and unsafe URLs before opening a write transaction', async () => {
    const valid = sampleRecord({ id: 'must-not-write' });
    const malformedRecord = sampleRecord({ id: 'bad-duration', durationMs: -1 });
    await expect(importBackupData([valid, malformedRecord], [], [])).rejects.toThrow();
    expect(await listStopwatchRecords()).toEqual([]);

    const unsafeFavorite = sampleFavorite({ url: 'javascript:alert(1)' });
    await expect(importBackupData([valid], [], [unsafeFavorite])).rejects.toThrow();
    expect(await listStopwatchRecords()).toEqual([]);
  });

  it('merges history by URL without violating the unique URL index', async () => {
    const { recordResultAction } = await import('./storage');
    const existing = {
      id: 'existing-history', url: 'https://example.com/item/123', source: 'example',
      sourceLabel: 'Example', lastAction: 'open' as const, lastActionAt: 20, createdAt: 10,
    };
    await recordResultAction(existing);
    await importBackupData([], [{
      ...existing, id: 'imported-history', lastAction: 'copy', lastActionAt: 30, createdAt: 5,
    }], []);

    const history = await listResultHistory();
    expect(history).toHaveLength(1);
    expect(history[0].id).toBe('existing-history');
    expect(history[0].lastAction).toBe('copy');
    expect(history[0].createdAt).toBe(10);
  });
});

describe('atomic single-item updates', () => {
  it('preserves history identity and creation time when the same URL is recorded again', async () => {
    const { recordResultAction } = await import('./storage');
    await recordResultAction({
      id: 'history-original',
      url: 'https://example.com/item/alpha',
      source: 'example',
      sourceLabel: 'Example',
      lastAction: 'open',
      lastActionAt: 100,
      createdAt: 50,
    });
    await recordResultAction({
      id: 'history-new',
      url: 'https://example.com/item/alpha',
      source: 'example',
      sourceLabel: 'Example',
      lastAction: 'copy',
      lastActionAt: 200,
      createdAt: 200,
    });

    const history = await listResultHistory();
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      id: 'history-original',
      createdAt: 50,
      lastAction: 'copy',
      lastActionAt: 200,
    });
  });

  it('keeps the newest tombstone when an older deletion arrives later', async () => {
    const { saveSyncTombstone } = await import('./storage');
    await saveSyncTombstone({
      key: 'favorites:favorite-x',
      entity: 'favorites',
      id: 'favorite-x',
      deletedAt: 500,
    });
    await saveSyncTombstone({
      key: 'favorites:favorite-x',
      entity: 'favorites',
      id: 'favorite-x',
      deletedAt: 300,
    });

    expect(await listSyncTombstones()).toContainEqual({
      key: 'favorites:favorite-x',
      entity: 'favorites',
      id: 'favorite-x',
      deletedAt: 500,
    });
  });
});
