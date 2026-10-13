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

  it('rejects unknown fields in sync documents and records', () => {
    const extraTopLevel = validDocument();
    Object.assign(extraTopLevel, { unexpected: true });
    expect(isValidSyncDocument(extraTopLevel)).toBe(false);

    const extraRecordField = validDocument();
    Object.assign(extraRecordField.stopwatchRecords[0], { unexpected: true });
    expect(isValidSyncDocument(extraRecordField)).toBe(false);

    const extraTombstoneField = validDocument();
    Object.assign(extraTombstoneField.tombstones[0], { unexpected: true });
    expect(isValidSyncDocument(extraTombstoneField)).toBe(false);
  });

  it('rejects blank IDs in records and tombstones', () => {
    const blankRecordId = validDocument();
    blankRecordId.stopwatchRecords[0].id = '   ';
    expect(isValidSyncDocument(blankRecordId)).toBe(false);

    const blankTombstoneId = validDocument();
    blankTombstoneId.tombstones[0].id = ' ';
    blankTombstoneId.tombstones[0].key = 'favorites: ';
    expect(isValidSyncDocument(blankTombstoneId)).toBe(false);
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

    const reversedTimestamps = validDocument();
    reversedTimestamps.stopwatchRecords[0].startedAt = 300;
    reversedTimestamps.stopwatchRecords[0].endedAt = 200;
    expect(isValidSyncDocument(reversedTimestamps)).toBe(false);

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
  it('rejects live records that conflict with a deletion tombstone', () => {
    const recordConflict = validDocument();
    recordConflict.tombstones.push({
      key: 'stopwatchRecords:record-1', entity: 'stopwatchRecords', id: 'record-1', deletedAt: 300,
    });
    expect(isValidSyncDocument(recordConflict)).toBe(false);

    const historyConflict = validDocument();
    historyConflict.tombstones.push({
      key: 'resultHistory:history-1', entity: 'resultHistory', id: 'history-1', deletedAt: 300,
    });
    expect(isValidSyncDocument(historyConflict)).toBe(false);

    const favoriteConflict = validDocument();
    favoriteConflict.tombstones.push({
      key: 'favorites:favorite-1', entity: 'favorites', id: 'favorite-1', deletedAt: 300,
    });
    expect(isValidSyncDocument(favoriteConflict)).toBe(false);
  });

  it('rejects duplicate IDs and URLs that could overwrite unrelated local data', () => {
    const duplicateRecord = validDocument();
    duplicateRecord.stopwatchRecords.push({ ...duplicateRecord.stopwatchRecords[0] });
    expect(isValidSyncDocument(duplicateRecord)).toBe(false);

    const duplicateHistoryUrl = validDocument();
    duplicateHistoryUrl.resultHistory.push({
      ...duplicateHistoryUrl.resultHistory[0], id: 'history-2',
    });
    expect(isValidSyncDocument(duplicateHistoryUrl)).toBe(false);

    const duplicateFavoriteUrl = validDocument();
    duplicateFavoriteUrl.favorites.push({
      ...duplicateFavoriteUrl.favorites[0], id: 'favorite-2',
    });
    expect(isValidSyncDocument(duplicateFavoriteUrl)).toBe(false);

    const duplicateTombstone = validDocument();
    duplicateTombstone.tombstones.push({ ...duplicateTombstone.tombstones[0] });
    expect(isValidSyncDocument(duplicateTombstone)).toBe(false);
  });

});
