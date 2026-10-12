import type { FavoriteItem, ResultHistoryItem, StopwatchRecord } from './storage';

export function validateBackupData(value: unknown): {
  stopwatchRecords: StopwatchRecord[];
  resultHistory: ResultHistoryItem[];
  favorites: FavoriteItem[];
  settings?: { theme?: 'system' | 'light' | 'dark' };
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('備份檔格式不正確。');
  }
  const data = value as Record<string, unknown>;
  if (data.format !== 'h-tools-backup' || data.schemaVersion !== 1
    || !Array.isArray(data.stopwatchRecords)
    || !Array.isArray(data.resultHistory)
    || !Array.isArray(data.favorites)
    || data.stopwatchRecords.length > 10000
    || data.resultHistory.length > 10000
    || data.favorites.length > 10000) {
    throw new Error('備份檔格式不正確，或資料筆數超過上限。');
  }
  if (data.settings !== undefined) {
    const settings = data.settings;
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)
      || Object.keys(settings).some((key) => key !== 'theme')
      || ((settings as Record<string, unknown>).theme !== undefined
        && !['system', 'light', 'dark'].includes(String((settings as Record<string, unknown>).theme)))) {
      throw new Error('備份中的設定格式不正確。');
    }
  }
  return {
    stopwatchRecords: data.stopwatchRecords as StopwatchRecord[],
    resultHistory: data.resultHistory as ResultHistoryItem[],
    favorites: data.favorites as FavoriteItem[],
    ...(data.settings ? { settings: data.settings as { theme?: 'system' | 'light' | 'dark' } } : {}),
  };
}
