import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDB } from 'idb';
import {
  applySyncSnapshotIfUnchanged,
  clearAllSyncableData,
  deleteFavorite,
  importBackupData,
  listFavorites,
  listResultHistory,
  listSyncTombstones,
  saveFavorite,
  saveSyncTombstone,
  recordResultAction,
  type FavoriteItem,
} from './storage';

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
  await listFavorites();
  const db = await openDB('h-tools', 5);
  await Promise.all([
    db.clear('favorites'),
    db.clear('result-history'),
    db.clear('sync-tombstones'),
  ]);
  db.close();
}

beforeEach(clearDatabase);
afterEach(clearDatabase);

describe('atomic local data clearing', () => {
  it('clears all records together and preserves tombstones for cloud sync', async () => {
    await saveFavorite(sampleFavorite());
    await recordResultAction({
      id: 'history-1',
      url: 'https://example.com/history',
      source: 'example',
      sourceLabel: 'Example',
      lastAction: 'open',
      lastActionAt: 100,
      createdAt: 100,
    });

    await clearAllSyncableData();

    expect(await listResultHistory()).toEqual([]);
    expect(await listFavorites()).toEqual([]);
    expect((await listSyncTombstones()).map((item) => item.key).sort()).toEqual([
      'favorites:favorite-1',
      'resultHistory:history-1',
    ]);
  });
});

describe('atomic sync snapshot application', () => {
  it('creates tombstones for every local item removed by an accepted cloud snapshot', async () => {
    const history = {
      id: 'removed-history',
      url: 'https://example.com/removed-history',
      source: 'example',
      sourceLabel: 'Example',
      lastAction: 'open' as const,
      lastActionAt: 200,
      createdAt: 100,
    };
    const favorite = sampleFavorite({
      id: 'removed-favorite',
      url: 'https://example.com/removed-favorite',
    });

    await recordResultAction(history);
    await saveFavorite(favorite);

    const applied = await applySyncSnapshotIfUnchanged(
      {
        resultHistory: [history],
        favorites: [favorite],
        tombstones: [],
      },
      {
        resultHistory: [],
        favorites: [],
        tombstones: [],
      },
    );

    expect(applied).toBe(true);
    expect(await listResultHistory()).toEqual([]);
    expect(await listFavorites()).toEqual([]);
    expect((await listSyncTombstones()).map((item) => item.key).sort()).toEqual([
      'favorites:removed-favorite',
      'resultHistory:removed-history',
    ]);
  });

  it('refuses a cloud snapshot when a deletion tombstone changes during sync', async () => {
    await saveSyncTombstone({
      key: 'favorites:deleted-during-sync',
      entity: 'favorites',
      id: 'deleted-during-sync',
      deletedAt: 1_000,
    });

    const applied = await applySyncSnapshotIfUnchanged(
      { resultHistory: [], favorites: [], tombstones: [] },
      {
        resultHistory: [],
        favorites: [sampleFavorite({ id: 'deleted-during-sync' })],
        tombstones: [],
      },
    );

    expect(applied).toBe(false);
    expect(await listFavorites()).toEqual([]);
    expect(await listSyncTombstones()).toContainEqual({
      key: 'favorites:deleted-during-sync',
      entity: 'favorites',
      id: 'deleted-during-sync',
      deletedAt: 1_000,
    });
  });

  it('preserves local deletion tombstones omitted by a cloud snapshot', async () => {
    const tombstone = {
      key: 'favorites:already-deleted',
      entity: 'favorites' as const,
      id: 'already-deleted',
      deletedAt: 2_000,
    };
    await saveSyncTombstone(tombstone);

    const staleFavorite = sampleFavorite({ id: 'already-deleted' });
    const applied = await applySyncSnapshotIfUnchanged(
      { resultHistory: [], favorites: [], tombstones: [tombstone] },
      { resultHistory: [], favorites: [staleFavorite], tombstones: [] },
    );

    expect(applied).toBe(true);
    expect(await listFavorites()).toEqual([]);
    expect(await listSyncTombstones()).toContainEqual(tombstone);
  });

  it('keeps the newer local deletion tombstone when the cloud has an older one', async () => {
    const localTombstone = {
      key: 'favorites:deleted-with-newer-marker',
      entity: 'favorites' as const,
      id: 'deleted-with-newer-marker',
      deletedAt: 3_000,
    };
    await saveSyncTombstone(localTombstone);

    const applied = await applySyncSnapshotIfUnchanged(
      { resultHistory: [], favorites: [], tombstones: [localTombstone] },
      {
        resultHistory: [],
        favorites: [],
        tombstones: [{ ...localTombstone, deletedAt: 1_000 }],
      },
    );

    expect(applied).toBe(true);
    expect(await listSyncTombstones()).toContainEqual(localTombstone);
  });

  it('refuses to replace data when the local snapshot has changed', async () => {
    const local = sampleFavorite({ id: 'changed-locally', title: 'Keep this local change' });
    await saveFavorite(local);

    const applied = await applySyncSnapshotIfUnchanged(
      { resultHistory: [], favorites: [], tombstones: [] },
      {
        resultHistory: [],
        favorites: [sampleFavorite({ id: 'remote-item', url: 'https://example.com/remote' })],
        tombstones: [],
      },
    );

    expect(applied).toBe(false);
    expect(await listFavorites()).toEqual([local]);
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

  it('deletes only the selected favorite', async () => {
    await saveFavorite(sampleFavorite({ id: 'keep' }));
    await saveFavorite(sampleFavorite({ id: 'remove', url: 'https://example.com/remove' }));
    await deleteFavorite('remove');

    expect((await listFavorites()).map((item) => item.id)).toEqual(['keep']);
  });
  it('keeps deletion tombstones increasing if the system clock moves backwards', async () => {
    await saveFavorite(sampleFavorite());
    let currentTime = 1_000;
    const now = vi.spyOn(Date, 'now').mockImplementation(() => currentTime);
    try {
      await deleteFavorite('favorite-1');
      currentTime = 500;
      await deleteFavorite('favorite-1');
    } finally {
      now.mockRestore();
    }

    const tombstone = (await listSyncTombstones()).find((item) => item.key === 'favorites:favorite-1');
    expect(tombstone?.deletedAt).toBe(1_001);
  });

});

describe('atomic backup import', () => {
  it('imports history and favorites and clears tombstones for restored entries', async () => {
    const history = {
      id: 'history-1',
      url: 'https://example.com/history',
      source: 'example',
      sourceLabel: 'Example',
      lastAction: 'open' as const,
      lastActionAt: 100,
      createdAt: 100,
    };
    const favorite = sampleFavorite();
    await saveFavorite(favorite);
    await deleteFavorite(favorite.id);
    expect((await listSyncTombstones()).some((item) => item.key === `favorites:${favorite.id}`)).toBe(true);

    await importBackupData([history], [favorite]);

    expect((await listResultHistory()).map((item) => item.id)).toEqual([history.id]);
    expect((await listFavorites()).map((item) => item.id)).toEqual([favorite.id]);
    expect((await listSyncTombstones()).some((item) => item.key === `favorites:${favorite.id}`)).toBe(false);
  });

  it('rejects invalid entries before writing any imported records', async () => {
    const validHistory = {
      id: 'should-roll-back',
      url: 'https://example.com/valid',
      source: 'example',
      sourceLabel: 'Example',
      lastAction: 'open' as const,
      lastActionAt: 100,
      createdAt: 100,
    };
    const invalid = { title: 'missing ID' } as unknown as typeof validHistory;

    await expect(importBackupData([validHistory, invalid], [])).rejects.toBeTruthy();
    expect(await listResultHistory()).toEqual([]);
  });

  it('rejects unknown fields during direct backup import', async () => {
    const validHistory = {
      id: 'must-not-write',
      url: 'https://example.com/valid',
      source: 'example',
      sourceLabel: 'Example',
      lastAction: 'open' as const,
      lastActionAt: 100,
      createdAt: 100,
    };
    const unknownField = { ...validHistory, id: 'unknown-field', injected: true } as unknown as typeof validHistory;

    await expect(importBackupData([validHistory, unknownField], [])).rejects.toThrow();
    expect(await listResultHistory()).toEqual([]);
  });

  it('rejects whitespace-only IDs in every backup entity before writing', async () => {
    const blankHistory = {
      id: '\t ',
      url: 'https://example.com/blank-history',
      source: 'example',
      sourceLabel: 'Example',
      lastAction: 'open' as const,
      lastActionAt: 100,
      createdAt: 100,
    };
    const blankFavorite = sampleFavorite({ id: ' ' });

    await expect(importBackupData([blankHistory], [])).rejects.toThrow();
    await expect(importBackupData([], [blankFavorite])).rejects.toThrow();
    expect(await listResultHistory()).toEqual([]);
    expect(await listFavorites()).toEqual([]);
  });

  it('rejects malformed fields and unsafe URLs before opening a write transaction', async () => {
    const validHistory = {
      id: 'must-not-write',
      url: 'https://example.com/valid',
      source: 'example',
      sourceLabel: 'Example',
      lastAction: 'open' as const,
      lastActionAt: 100,
      createdAt: 100,
    };
    const malformedHistory = { ...validHistory, id: 'bad-timestamp', lastActionAt: -1 };
    await expect(importBackupData([validHistory, malformedHistory], [])).rejects.toThrow();
    expect(await listResultHistory()).toEqual([]);

    const unsafeFavorite = sampleFavorite({ url: 'javascript:alert(1)' });
    await expect(importBackupData([], [unsafeFavorite])).rejects.toThrow();
    expect(await listFavorites()).toEqual([]);
  });

  it('remaps imported IDs that already belong to different URLs', async () => {
    const existingHistory = {
      id: 'shared-history-id',
      url: 'https://example.com/original-history',
      source: 'example',
      sourceLabel: 'Original history',
      lastAction: 'open' as const,
      lastActionAt: 100,
      createdAt: 50,
    };
    const existingFavorite = sampleFavorite({
      id: 'shared-favorite-id',
      url: 'https://example.com/original-favorite',
      title: 'Original favorite',
    });
    await recordResultAction(existingHistory);
    await saveFavorite(existingFavorite);

    await importBackupData([{
      ...existingHistory,
      url: 'https://example.com/imported-history',
      sourceLabel: 'Imported history',
      lastAction: 'copy',
      lastActionAt: 200,
    }], [{
      ...existingFavorite,
      url: 'https://example.com/imported-favorite',
      title: 'Imported favorite',
      updatedAt: 200,
    }]);

    const history = await listResultHistory();
    const favorites = await listFavorites();
    expect(history).toHaveLength(2);
    expect(history.find((item) => item.url === existingHistory.url)).toEqual(existingHistory);
    expect(history.find((item) => item.url === 'https://example.com/imported-history')?.id)
      .not.toBe(existingHistory.id);
    expect(favorites).toHaveLength(2);
    expect(favorites.find((item) => item.url === existingFavorite.url)).toEqual(existingFavorite);
    expect(favorites.find((item) => item.url === 'https://example.com/imported-favorite')?.id)
      .not.toBe(existingFavorite.id);
  });

  it('merges history by URL without violating the unique URL index', async () => {
    const { recordResultAction } = await import('./storage');
    const existing = {
      id: 'existing-history', url: 'https://example.com/item/123', source: 'example',
      sourceLabel: 'Example', lastAction: 'open' as const, lastActionAt: 20, createdAt: 10,
    };
    await recordResultAction(existing);
    await importBackupData([{
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
