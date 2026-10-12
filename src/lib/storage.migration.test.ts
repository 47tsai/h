import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { deleteDB, openDB } from 'idb';

const databaseName = 'h-tools';

afterEach(async () => {
  await deleteDB(databaseName);
});

describe('IndexedDB schema migration', () => {
  it('upgrades a v1 database to v2 without losing stopwatch records', async () => {
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

    // Import after creating the v1 database so the production module upgrades this exact database.
    const storage = await import('./storage');
    expect(await storage.listStopwatchRecords()).toEqual([legacyRecord]);
    expect(await storage.listFavorites()).toEqual([]);

    const upgradedDb = await openDB(databaseName, 2);
    expect(Array.from(upgradedDb.objectStoreNames)).toEqual(['favorites', 'stopwatch-records']);
    expect(Array.from(upgradedDb.transaction('favorites').store.indexNames)).toEqual(['by-createdAt', 'by-title']);
    expect(await upgradedDb.get('stopwatch-records', 'legacy-record')).toEqual(legacyRecord);
    upgradedDb.close();
  });
});
