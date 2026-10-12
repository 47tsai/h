import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDB } from 'idb';
import { listFavorites, listResultHistory, listStopwatchRecords, listSyncTombstones, recordResultAction, saveFavorite } from './storage';
import { syncWithCloud } from './sync';

async function clearDatabase() {
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

  it('replaces a same-URL history item with the canonical merged ID', async () => {
    await recordResultAction({
      id: 'local-history',
      url: 'https://example.com/history',
      source: 'local',
      sourceLabel: 'Local',
      lastAction: 'open',
      lastActionAt: 200,
      createdAt: 100,
    });

    const document = {
      schemaVersion: 1 as const,
      updatedAt: '2026-10-12T12:00:00.000Z',
      settings: { theme: 'dark' as const },
      stopwatchRecords: [],
      resultHistory: [{
        id: 'remote-history',
        url: 'https://example.com/history',
        source: 'remote',
        sourceLabel: 'Remote',
        lastAction: 'copy' as const,
        lastActionAt: 200,
        createdAt: 90,
      }],
      favorites: [],
      tombstones: [],
    };

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      syncedAt: '2026-10-12T12:01:00.000Z',
      document,
    }), { status: 200, headers: { 'content-type': 'application/json' } })));

    await syncWithCloud('https://sync.example.com', 'dark');

    expect(await listResultHistory()).toEqual(document.resultHistory);
    expect(await listSyncTombstones()).toContainEqual({
      key: 'resultHistory:local-history',
      entity: 'resultHistory',
      id: 'local-history',
      deletedAt: expect.any(Number),
    });
  });
});
