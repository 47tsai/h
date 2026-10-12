import { describe, expect, it } from 'vitest';
import { isValidSyncDocument } from './sync';

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

describe('cloud sync document validation', () => {
  it('accepts a valid version 1 document', () => {
    expect(isValidSyncDocument(validDocument())).toBe(true);
  });

  it('rejects unsafe URLs containing credentials', () => {
    const document = validDocument();
    document.favorites[0].url = 'https://user:password@example.com/item/2';
    expect(isValidSyncDocument(document)).toBe(false);
  });

  it('rejects malformed timestamps and unsupported settings', () => {
    const badTimestamp = validDocument();
    badTimestamp.stopwatchRecords[0].durationMs = -1;
    expect(isValidSyncDocument(badTimestamp)).toBe(false);

    const badSettings = validDocument();
    Object.assign(badSettings.settings, { token: 'unexpected' });
    expect(isValidSyncDocument(badSettings)).toBe(false);
  });

  it('rejects inconsistent tombstone keys and invalid URLs', () => {
    const badTombstone = validDocument();
    badTombstone.tombstones[0].key = 'favorites:someone-else';
    expect(isValidSyncDocument(badTombstone)).toBe(false);

    const badUrl = validDocument();
    badUrl.resultHistory[0].url = 'javascript:alert(1)';
    expect(isValidSyncDocument(badUrl)).toBe(false);
  });
});
