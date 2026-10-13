import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from './index.js';

const validDocument = () => ({
  schemaVersion: 1,
  updatedAt: '2026-10-12T12:00:00.000Z',
  settings: { theme: 'dark' },
  stopwatchRecords: [{
    id: 'record-1', startedAt: 100, endedAt: 200, durationMs: 100,
    title: 'Timer', createdAt: 200,
  }],
  resultHistory: [{
    id: 'history-1', url: 'https://example.com/item/1', source: 'example',
    sourceLabel: 'Example', lastAction: 'open', lastActionAt: 200, createdAt: 100,
  }],
  favorites: [{
    id: 'favorite-1', url: 'https://example.com/item/2', title: 'Example',
    createdAt: 100, updatedAt: 200,
  }],
  tombstones: [{
    key: 'favorites:deleted-1', entity: 'favorites', id: 'deleted-1', deletedAt: 200,
  }],
});

async function send(document, env = {}) {
  return worker.fetch(new Request('https://sync.example.com/api/sync', {
    method: 'POST',
    headers: {
      origin: 'https://h.chi.qzz.io',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ action: 'sync', document }),
  }), { ALLOWED_ORIGIN: 'https://h.chi.qzz.io', ...env });
}

function mockGitHub(remoteDocument) {
  const saved = [];
  vi.stubGlobal('fetch', vi.fn(async (_url, options = {}) => {
    if (!options.method || options.method === 'GET') {
      return new Response(JSON.stringify({
        sha: 'remote-sha',
        content: btoa(JSON.stringify(remoteDocument)),
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    const body = JSON.parse(options.body);
    saved.push(JSON.parse(atob(body.content)));
    return new Response(JSON.stringify({ content: { sha: 'saved-sha' } }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  }));
  return saved;
}

afterEach(() => vi.unstubAllGlobals());

describe('sync Worker request validation', () => {
  it('rejects duplicate IDs, URLs, and tombstone keys before remote access', async () => {
    const duplicateRecord = validDocument();
    duplicateRecord.stopwatchRecords.push({ ...duplicateRecord.stopwatchRecords[0] });
    expect((await send(duplicateRecord)).status).toBe(400);

    const duplicateHistoryUrl = validDocument();
    duplicateHistoryUrl.resultHistory.push({
      ...duplicateHistoryUrl.resultHistory[0], id: 'history-2',
    });
    expect((await send(duplicateHistoryUrl)).status).toBe(400);

    const duplicateFavoriteUrl = validDocument();
    duplicateFavoriteUrl.favorites.push({
      ...duplicateFavoriteUrl.favorites[0], id: 'favorite-2',
    });
    expect((await send(duplicateFavoriteUrl)).status).toBe(400);

    const duplicateTombstone = validDocument();
    duplicateTombstone.tombstones.push({ ...duplicateTombstone.tombstones[0] });
    expect((await send(duplicateTombstone)).status).toBe(400);
  });

  it('rejects live records that conflict with deletion tombstones', async () => {
    const recordConflict = validDocument();
    recordConflict.tombstones.push({
      key: 'stopwatchRecords:record-1', entity: 'stopwatchRecords', id: 'record-1', deletedAt: 300,
    });
    expect((await send(recordConflict)).status).toBe(400);

    const historyConflict = validDocument();
    historyConflict.tombstones.push({
      key: 'resultHistory:history-1', entity: 'resultHistory', id: 'history-1', deletedAt: 300,
    });
    expect((await send(historyConflict)).status).toBe(400);

    const favoriteConflict = validDocument();
    favoriteConflict.tombstones.push({
      key: 'favorites:favorite-1', entity: 'favorites', id: 'favorite-1', deletedAt: 300,
    });
    expect((await send(favoriteConflict)).status).toBe(400);
  });

  it('rejects stopwatch records whose end time precedes their start time', async () => {
    const reversedTimestamps = validDocument();
    reversedTimestamps.stopwatchRecords[0].startedAt = 300;
    reversedTimestamps.stopwatchRecords[0].endedAt = 200;
    expect((await send(reversedTimestamps)).status).toBe(400);
  });

  it('rejects blank IDs in every entity and tombstones', async () => {
    const blankRecordId = validDocument();
    blankRecordId.stopwatchRecords[0].id = '   ';
    expect((await send(blankRecordId)).status).toBe(400);

    const blankHistoryId = validDocument();
    blankHistoryId.resultHistory[0].id = '\t ';
    expect((await send(blankHistoryId)).status).toBe(400);

    const blankFavoriteId = validDocument();
    blankFavoriteId.favorites[0].id = ' ';
    expect((await send(blankFavoriteId)).status).toBe(400);

    const blankTombstoneId = validDocument();
    blankTombstoneId.tombstones[0].id = ' ';
    blankTombstoneId.tombstones[0].key = 'favorites: ';
    expect((await send(blankTombstoneId)).status).toBe(400);
  });

  it('rejects IDs longer than the supported limit', async () => {
    const record = validDocument();
    record.stopwatchRecords[0].id = 'x'.repeat(201);
    expect((await send(record)).status).toBe(400);

    const history = validDocument();
    history.resultHistory[0].id = 'x'.repeat(201);
    expect((await send(history)).status).toBe(400);

    const favorite = validDocument();
    favorite.favorites[0].id = 'x'.repeat(201);
    expect((await send(favorite)).status).toBe(400);

    const tombstone = validDocument();
    tombstone.tombstones[0].id = 'x'.repeat(201);
    tombstone.tombstones[0].key = 'favorites:' + tombstone.tombstones[0].id;
    expect((await send(tombstone)).status).toBe(400);
  });

  it('rejects unknown fields in sync documents and records', async () => {
    const extraTopLevel = validDocument();
    extraTopLevel.unexpected = true;
    expect((await send(extraTopLevel)).status).toBe(400);

    const extraRecordField = validDocument();
    extraRecordField.stopwatchRecords[0].unexpected = true;
    expect((await send(extraRecordField)).status).toBe(400);

    const extraTombstoneField = validDocument();
    extraTombstoneField.tombstones[0].unexpected = true;
    expect((await send(extraTombstoneField)).status).toBe(400);
  });

  it('rejects documents without the settings object required by the client', async () => {
    const missingSettings = validDocument();
    delete missingSettings.settings;
    expect((await send(missingSettings)).status).toBe(400);
  });

  it('rejects non-JSON requests without trying to sync', async () => {
    const response = await worker.fetch(new Request('https://sync.example.com/api/sync', {
      method: 'POST',
      headers: { origin: 'https://h.chi.qzz.io', 'content-type': 'text/plain' },
      body: 'not json',
    }), { ALLOWED_ORIGIN: 'https://h.chi.qzz.io' });
    expect(response.status).toBe(400);
  });
});


describe('sync Worker merge behavior', () => {
  const githubEnv = {
    GITHUB_OWNER: 'owner',
    GITHUB_REPO: 'repo',
    GITHUB_TOKEN: 'test-token',
    GITHUB_BRANCH: 'main',
    GITHUB_FILE_PATH: 'data/sync.json',
  };

  it('does not resurrect a local record deleted on another device', async () => {
    const local = validDocument();
    const remote = validDocument();
    remote.stopwatchRecords = [];
    remote.tombstones = [{
      key: 'stopwatchRecords:record-1',
      entity: 'stopwatchRecords',
      id: 'record-1',
      deletedAt: 300,
    }];
    const saved = mockGitHub(remote);

    const response = await send(local, githubEnv);
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.document.stopwatchRecords).toEqual([]);
    expect(result.document.tombstones).toContainEqual(remote.tombstones[0]);
    expect(saved).toHaveLength(1);
    expect(saved[0].stopwatchRecords).toEqual([]);
  });

  it('uses remote data when matching records have equal timestamps', async () => {
    const local = validDocument();
    local.favorites[0].title = 'Local title';
    const remote = validDocument();
    remote.favorites[0].title = 'Remote title';
    const saved = mockGitHub(remote);

    const response = await send(local, githubEnv);
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.document.favorites).toHaveLength(1);
    expect(result.document.favorites[0].title).toBe('Remote title');
    expect(saved[0].favorites[0].title).toBe('Remote title');
  });

  it('canonicalizes same-URL favorites and history items from different devices', async () => {
    const local = validDocument();
    local.resultHistory[0] = {
      ...local.resultHistory[0],
      id: 'local-history',
      url: 'https://example.com/shared-history',
      lastActionAt: 500,
      createdAt: 400,
    };
    local.favorites[0] = {
      ...local.favorites[0],
      id: 'local-favorite',
      url: 'https://example.com/shared-favorite',
      updatedAt: 500,
      createdAt: 400,
    };

    const remote = validDocument();
    remote.resultHistory[0] = {
      ...remote.resultHistory[0],
      id: 'remote-history',
      url: 'https://example.com/shared-history',
      lastActionAt: 500,
      createdAt: 300,
    };
    remote.favorites[0] = {
      ...remote.favorites[0],
      id: 'remote-favorite',
      url: 'https://example.com/shared-favorite',
      updatedAt: 500,
      createdAt: 300,
    };

    const saved = mockGitHub(remote);
    const response = await send(local, githubEnv);
    expect(response.status).toBe(200);
    const result = await response.json();

    expect(result.document.resultHistory).toHaveLength(1);
    expect(result.document.resultHistory[0].id).toBe('remote-history');
    expect(result.document.resultHistory[0].createdAt).toBe(300);
    expect(result.document.favorites).toHaveLength(1);
    expect(result.document.favorites[0].id).toBe('remote-favorite');
    expect(result.document.favorites[0].createdAt).toBe(300);
    expect(saved[0].resultHistory).toEqual(result.document.resultHistory);
    expect(saved[0].favorites).toEqual(result.document.favorites);
  });


  it('keeps the canonical remote ID while applying newer local data for the same URL', async () => {
    const local = validDocument();
    local.favorites[0] = {
      ...local.favorites[0],
      id: 'local-favorite-newer',
      url: 'https://example.com/shared-favorite',
      title: 'New local title',
      notes: 'Updated on this device',
      updatedAt: 900,
      createdAt: 400,
    };

    const remote = validDocument();
    remote.favorites[0] = {
      ...remote.favorites[0],
      id: 'remote-favorite-canonical',
      url: 'https://example.com/shared-favorite',
      title: 'Older remote title',
      notes: 'Older remote note',
      updatedAt: 500,
      createdAt: 300,
    };

    const saved = mockGitHub(remote);
    const response = await send(local, githubEnv);
    expect(response.status).toBe(200);
    const result = await response.json();

    expect(result.document.favorites).toHaveLength(1);
    expect(result.document.favorites[0]).toMatchObject({
      id: 'remote-favorite-canonical',
      title: 'New local title',
      notes: 'Updated on this device',
      updatedAt: 900,
      createdAt: 300,
    });
    expect(saved[0].favorites).toEqual(result.document.favorites);
  });

});
