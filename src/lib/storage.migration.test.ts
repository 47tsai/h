import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deleteDB, openDB } from 'idb';
import * as storage from './storage';

const databaseName = 'h-tools';

beforeEach(async () => {
  await storage.closeStorageDatabase();
  await deleteDB(databaseName);
});

afterEach(async () => {
  await storage.closeStorageDatabase();
  await deleteDB(databaseName);
});

describe('IndexedDB schema migration', () => {
  it('upgrades a v1 database to v4 without losing stopwatch records', async () => {
    const legacyRecord = {
      id: 'legacy-record',
      startedAt: 1_000,
      endedAt: 5_000,
      durationMs: 4_000,
      title: 'Legacy session',
      createdAt: 5_000,
    };

    const legacyDb = await openDB(databaseName, 1, {
      upgrade(db) {
        const store = db.createObjectStore('stopwatch-records', { keyPath: 'id' });
        store.createIndex('by-createdAt', 'createdAt');
      },
    });
    await legacyDb.put('stopwatch-records', legacyRecord);
    legacyDb.close();

    // The storage module opens lazily and upgrades the existing v1 database to the current schema.
    expect(await storage.listStopwatchRecords()).toEqual([legacyRecord]);
    expect(await storage.listFavorites()).toEqual([]);

    const upgradedDb = await openDB(databaseName, 4);
    expect(Array.from(upgradedDb.objectStoreNames)).toEqual(['favorites', 'result-history', 'stopwatch-records', 'sync-tombstones']);
    expect(Array.from(upgradedDb.transaction('favorites').store.indexNames)).toEqual(['by-createdAt', 'by-title']);
    expect(Array.from(upgradedDb.transaction('result-history').store.indexNames)).toEqual(['by-lastActionAt', 'by-url']);
    expect(await upgradedDb.get('stopwatch-records', 'legacy-record')).toEqual(legacyRecord);
    upgradedDb.close();
  });
});
