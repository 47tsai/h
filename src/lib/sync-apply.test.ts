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

  it('retries when local data changes while the sync request is in flight', async () => {
    const newFavorite = {
      id: 'added-during-sync',
      url: 'https://example.com/added-during-sync',
      title: 'Added while syncing',
      createdAt: 300,
      updatedAt: 300,
    };
    let calls = 0;
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      calls += 1;
      const payload = JSON.parse(String(init?.body));
      if (calls === 1) {
        await saveFavorite(newFavorite);
      }
      return new Response(JSON.stringify({
        ok: true,
        syncedAt: '2026-10-12T12:01:00.000Z',
        document: payload.document,
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    await syncWithCloud('https://sync.example.com', 'dark');

    expect(calls).toBe(2);
    expect(await listFavorites()).toEqual([newFavorite]);
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).document.favorites).toEqual([newFavorite]);
  });


  it('stops after bounded retries without applying a stale cloud snapshot', async () => {
    let calls = 0;
    const addedFavorites = [1, 2, 3].map((n) => ({
      id: 'added-during-sync-' + n,
      url: 'https://example.com/added-during-sync-' + n,
      title: 'Added during sync ' + n,
      createdAt: 300 + n,
      updatedAt: 300 + n,
    }));
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body));
      await saveFavorite(addedFavorites[calls]);
      calls += 1;
      return new Response(JSON.stringify({
        ok: true,
        syncedAt: '2026-10-12T12:01:00.000Z',
        document: payload.document,
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(syncWithCloud('https://sync.example.com', 'dark'))
      .rejects.toThrow('同步期間本機資料持續變更');

    expect(calls).toBe(3);
    expect((await listFavorites()).map((item) => item.id).sort()).toEqual(addedFavorites.map((item) => item.id).sort());
  });

});
