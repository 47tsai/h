import type { FavoriteItem, ResultHistoryItem, StopwatchRecord } from './storage';

export interface BackupData {
  stopwatchRecords: StopwatchRecord[];
  resultHistory: ResultHistoryItem[];
  favorites: FavoriteItem[];
  settings?: { theme?: 'system' | 'light' | 'dark' };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 200;
}

function isTimestamp(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 4096) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:')
      && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function hasUniqueValues(items: Record<string, unknown>[], field: string): boolean {
  const values = new Set<unknown>();
  for (const item of items) {
    if (values.has(item[field])) return false;
    values.add(item[field]);
  }
  return true;
}

export function validateBackupData(value: unknown): BackupData {
  if (!isObject(value) || value.format !== 'h-tools-backup' || value.schemaVersion !== 1
    || typeof value.exportedAt !== 'string' || !Number.isFinite(Date.parse(value.exportedAt))
    || !hasOnlyKeys(value, ['format', 'schemaVersion', 'exportedAt', 'settings', 'stopwatchRecords', 'resultHistory', 'favorites'])) {
    throw new Error('備份檔格式不正確或版本不支援。');
  }

  const records = value.stopwatchRecords;
  const history = value.resultHistory;
  const favorites = value.favorites;
  if (!Array.isArray(records) || !Array.isArray(history) || !Array.isArray(favorites)
    || records.length > 10000 || history.length > 10000 || favorites.length > 10000) {
    throw new Error('備份資料結構不正確，或單一類型資料超過 10,000 筆。');
  }

  const validRecord = (item: unknown): item is StopwatchRecord => isObject(item)
    && hasOnlyKeys(item, ['id', 'startedAt', 'endedAt', 'durationMs', 'title', 'createdAt'])
    && isId(item.id) && typeof item.title === 'string' && item.title.length <= 500
    && isTimestamp(item.startedAt) && isTimestamp(item.endedAt)
    && isTimestamp(item.durationMs) && isTimestamp(item.createdAt);

  const validHistory = (item: unknown): item is ResultHistoryItem => isObject(item)
    && hasOnlyKeys(item, ['id', 'url', 'source', 'sourceLabel', 'lastAction', 'lastActionAt', 'createdAt'])
    && isId(item.id) && isHttpUrl(item.url)
    && typeof item.source === 'string' && item.source.length <= 200
    && typeof item.sourceLabel === 'string' && item.sourceLabel.length <= 500
    && ['open', 'copy', 'share'].includes(String(item.lastAction))
    && isTimestamp(item.lastActionAt) && isTimestamp(item.createdAt);

  const validFavorite = (item: unknown): item is FavoriteItem => isObject(item)
    && hasOnlyKeys(item, ['id', 'source', 'url', 'title', 'notes', 'createdAt', 'updatedAt'])
    && isId(item.id) && isHttpUrl(item.url)
    && typeof item.title === 'string' && item.title.length <= 500
    && (item.source === undefined || (typeof item.source === 'string' && item.source.length <= 200))
    && (item.notes === undefined || (typeof item.notes === 'string' && item.notes.length <= 5000))
    && isTimestamp(item.createdAt) && isTimestamp(item.updatedAt);

  const recordObjects = records.filter(isObject);
  const historyObjects = history.filter(isObject);
  const favoriteObjects = favorites.filter(isObject);
  if (!records.every(validRecord) || !history.every(validHistory) || !favorites.every(validFavorite)
    || !hasUniqueValues(recordObjects, 'id')
    || !hasUniqueValues(historyObjects, 'id') || !hasUniqueValues(historyObjects, 'url')
    || !hasUniqueValues(favoriteObjects, 'id') || !hasUniqueValues(favoriteObjects, 'url')) {
    throw new Error('備份包含無效或重複的欄位、ID 或網址，未匯入任何內容。');
  }

  let settings: BackupData['settings'];
  if (value.settings !== undefined) {
    if (!isObject(value.settings) || !hasOnlyKeys(value.settings, ['theme'])
      || (value.settings.theme !== undefined
        && !['system', 'light', 'dark'].includes(String(value.settings.theme)))) {
      throw new Error('備份中的設定格式不正確。');
    }
    settings = value.settings as BackupData['settings'];
  }

  return {
    ...(settings ? { settings } : {}),
    stopwatchRecords: records,
    resultHistory: history,
    favorites,
  };
}
