import { describe, expect, it } from 'vitest';
import { validateBackupData } from './backup';

const validBackup = () => ({
  format: 'h-tools-backup',
  schemaVersion: 2,
  exportedAt: '2026-10-12T12:00:00.000Z',
  settings: { theme: 'dark' },
  resultHistory: [{
    id: 'history-1', url: 'https://example.com/item/1', source: 'example',
    sourceLabel: 'Example', lastAction: 'open', lastActionAt: 200, createdAt: 100,
  }],
  favorites: [{
    id: 'favorite-1', url: 'https://example.com/item/2', title: 'Example',
    createdAt: 100, updatedAt: 200,
  }],
});

describe('backup validation', () => {
  it('accepts a well-formed backup and returns only importable data', () => {
    const backup = validBackup();
    expect(validateBackupData(backup)).toMatchObject({
      settings: { theme: 'dark' },
      resultHistory: backup.resultHistory,
      favorites: backup.favorites,
    });
    expect(validateBackupData(backup)).not.toHaveProperty('format');
    expect(validateBackupData(backup)).not.toHaveProperty('exportedAt');
  });

  it('rejects unsafe URLs and duplicate history or favorite URLs', () => {
    const unsafe = validBackup();
    unsafe.favorites[0].url = 'javascript:alert(1)';
    expect(() => validateBackupData(unsafe)).toThrow();

    const duplicateHistory = validBackup();
    duplicateHistory.resultHistory.push({ ...duplicateHistory.resultHistory[0], id: 'history-2' });
    expect(() => validateBackupData(duplicateHistory)).toThrow();

    const duplicateFavorite = validBackup();
    duplicateFavorite.favorites.push({ ...duplicateFavorite.favorites[0], id: 'favorite-2' });
    expect(() => validateBackupData(duplicateFavorite)).toThrow();
  });

  it('rejects unknown fields and malformed settings', () => {
    const extraField = validBackup();
    Object.assign(extraField.resultHistory[0], { unexpected: true });
    expect(() => validateBackupData(extraField)).toThrow();

    const badSettings = validBackup();
    Object.assign(badSettings.settings, { token: 'unexpected' });
    expect(() => validateBackupData(badSettings)).toThrow();
  });

  it('rejects whitespace-only IDs in every backup entity', () => {
    const blankHistory = validBackup();
    blankHistory.resultHistory[0].id = '\t ';
    expect(() => validateBackupData(blankHistory)).toThrow();

    const blankFavorite = validBackup();
    blankFavorite.favorites[0].id = ' ';
    expect(() => validateBackupData(blankFavorite)).toThrow();
  });

  it('rejects IDs longer than the supported limit', () => {
    const history = validBackup();
    history.resultHistory[0].id = 'x'.repeat(201);
    expect(() => validateBackupData(history)).toThrow();

    const favorite = validBackup();
    favorite.favorites[0].id = 'x'.repeat(201);
    expect(() => validateBackupData(favorite)).toThrow();
  });

  it('accepts IDs at the maximum supported length', () => {
    const backup = validBackup();
    const maxId = 'x'.repeat(200);
    backup.resultHistory[0].id = maxId;
    backup.favorites[0].id = maxId;
    expect(() => validateBackupData(backup)).not.toThrow();
  });

  it('rejects duplicate IDs and unsupported backup versions', () => {
    const duplicate = validBackup();
    duplicate.resultHistory.push({ ...duplicate.resultHistory[0], id: 'history-2' });
    expect(() => validateBackupData(duplicate)).toThrow();

    const wrongVersion = validBackup();
    wrongVersion.schemaVersion = 99;
    expect(() => validateBackupData(wrongVersion)).toThrow();

    const oldVersion = validBackup();
    oldVersion.schemaVersion = 1;
    Object.assign(oldVersion, {
      stopwatchRecords: [{ id: 'record-1', startedAt: 100, endedAt: 200, durationMs: 100, title: 'Timer', createdAt: 200 }],
    });
    expect(() => validateBackupData(oldVersion)).toThrow();
  });
});
