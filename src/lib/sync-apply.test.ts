import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDB } from 'idb';
import { listFavorites, listSyncTombstones, saveFavorite } from './storage';
import { syncWithCloud } from './sync';

async function clearDatabase() {
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
afterEach(async () => {
  vi.unstubAllGlobals();
  await clearDatabase();
});

describe('applying cloud sync results', () => {
  it('replaces a same-URL favorite with the canonical merged ID instead of duplicating it', async () => {
    await saveFavorite({
      id: 'local-favorite',
      url: 'https://example.com/shared',
      title: 'Local title',
      createdAt: 100,
      updatedAt: 200,
    });

    const document = {
      schemaVersion: 1 as const,
      updatedAt: '2026-10-12T12:00:00.000Z',
      settings: { theme: 'dark' as const },
      stopwatchRecords: [],
      resultHistory: [],
      favorites: [{
        id: 'remote-favorite',
        url: 'https://example.com/shared',
        title: 'Remote title',
        createdAt: 90,
        updatedAt: 200,
      }],
      tombstones: [],
    };

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      syncedAt: '2026-10-12T12:01:00.000Z',
      document,
    }), { status: 200, headers: { 'content-type': 'application/json' } })));

    await syncWithCloud('https://sync.example.com', 'dark');

    expect(await listFavorites()).toEqual(document.favorites);
    expect(await listSyncTombstones()).toContainEqual({
      key: 'favorites:local-favorite',
      entity: 'favorites',
      id: 'local-favorite',
      deletedAt: expect.any(Number),
    });
  });
});
