import { describe, expect, it } from 'vitest';
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

async function send(document) {
  return worker.fetch(new Request('https://sync.example.com/api/sync', {
    method: 'POST',
    headers: {
      origin: 'https://h.chi.qzz.io',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ action: 'sync', document }),
  }), { ALLOWED_ORIGIN: 'https://h.chi.qzz.io' });
}

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
