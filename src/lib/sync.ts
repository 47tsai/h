import {
  deleteFavorite,
  deleteResultHistory,
  deleteStopwatchRecord,
  listFavorites,
  listResultHistory,
  listStopwatchRecords,
  listSyncTombstones,
  recordResultAction,
  saveFavorite,
  saveStopwatchRecord,
  saveSyncTombstone,
  type FavoriteItem,
  type ResultHistoryItem,
  type StopwatchRecord,
  type SyncTombstone,
} from './storage';

export interface SyncDocument {
  schemaVersion: 1;
  updatedAt: string;
  settings: { theme?: 'system' | 'light' | 'dark' };
  stopwatchRecords: StopwatchRecord[];
  resultHistory: ResultHistoryItem[];
  favorites: FavoriteItem[];
  tombstones: SyncTombstone[];
}

const ERROR_MESSAGES: Record<string, string> = {
  AUTH_FAILED: '同步密碼錯誤。',
  RATE_LIMITED: '嘗試次數過多，請稍後再試。',
  ORIGIN_NOT_ALLOWED: '這個網站未獲同步服務授權。',
  PAYLOAD_TOO_LARGE: '同步資料過大，請先整理資料。',
  BAD_REQUEST: '同步資料格式不正確。',
  SYNC_CONFLICT: '雲端資料正在變更，請稍後再同步。',
  GITHUB_RATE_LIMITED: 'GitHub 暫時限制請求，請稍後再試。',
  GITHUB_PERMISSION_ERROR: '同步服務無法存取私人資料庫，請檢查 Worker 設定。',
  GITHUB_UNAVAILABLE: '目前無法連線 GitHub，請稍後再試。',
  REMOTE_DATA_INVALID: '雲端資料格式有誤，為保護資料已停止同步。',
  SERVER_NOT_CONFIGURED: '同步服務尚未完成設定。',
  TOO_MANY_ITEMS: '資料筆數超出同步上限。',
};

function isSafeWorkerUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
}

function isSafeHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 4096) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:')
      && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function isTimestamp(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isValidSyncDocument(value: unknown): value is SyncDocument {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const document = value as Record<string, unknown>;
  if (document.schemaVersion !== 1 || typeof document.updatedAt !== 'string'
    || !Number.isFinite(Date.parse(document.updatedAt))) return false;

  const settings = document.settings;
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return false;
  const theme = (settings as Record<string, unknown>).theme;
  if (Object.keys(settings).some((key) => key !== 'theme')
    || (theme !== undefined && !['system', 'light', 'dark'].includes(String(theme)))) return false;

  if (!Array.isArray(document.stopwatchRecords) || !Array.isArray(document.resultHistory)
    || !Array.isArray(document.favorites) || !Array.isArray(document.tombstones)) return false;

  const validRecord = (value: unknown): value is StopwatchRecord => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const item = value as Record<string, unknown>;
    return typeof item.id === 'string' && item.id.length > 0 && item.id.length <= 200
      && typeof item.title === 'string' && item.title.length <= 500
      && isTimestamp(item.startedAt) && isTimestamp(item.endedAt)
      && isTimestamp(item.durationMs) && isTimestamp(item.createdAt);
  };
  const validHistoryItem = (value: unknown): value is ResultHistoryItem => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const item = value as Record<string, unknown>;
    return typeof item.id === 'string' && item.id.length > 0 && item.id.length <= 200
      && isSafeHttpUrl(item.url)
      && typeof item.source === 'string' && item.source.length <= 200
      && typeof item.sourceLabel === 'string' && item.sourceLabel.length <= 500
      && ['open', 'copy', 'share'].includes(String(item.lastAction))
      && isTimestamp(item.lastActionAt) && isTimestamp(item.createdAt);
  };
  const validFavorite = (value: unknown): value is FavoriteItem => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const item = value as Record<string, unknown>;
    return typeof item.id === 'string' && item.id.length > 0 && item.id.length <= 200
      && isSafeHttpUrl(item.url)
      && typeof item.title === 'string' && item.title.length <= 500
      && (item.source === undefined || (typeof item.source === 'string' && item.source.length <= 200))
      && (item.notes === undefined || (typeof item.notes === 'string' && item.notes.length <= 5000))
      && isTimestamp(item.createdAt) && isTimestamp(item.updatedAt);
  };
  const validTombstone = (value: unknown): value is SyncTombstone => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const item = value as Record<string, unknown>;
    return ['stopwatchRecords', 'resultHistory', 'favorites'].includes(String(item.entity))
      && typeof item.id === 'string' && item.id.length > 0 && item.id.length <= 200
      && item.key === String(item.entity) + ':' + item.id && isTimestamp(item.deletedAt);
  };

  return document.stopwatchRecords.length <= 10000
    && document.resultHistory.length <= 10000 && document.favorites.length <= 10000
    && document.tombstones.length <= 30000
    && document.stopwatchRecords.every(validRecord)
    && document.resultHistory.every(validHistoryItem)
    && document.favorites.every(validFavorite)
    && document.tombstones.every(validTombstone);
}

function validateResponse(value: unknown): value is { ok: true; document: SyncDocument; syncedAt: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const response = value as Record<string, unknown>;
  return response.ok === true && typeof response.syncedAt === 'string'
    && Number.isFinite(Date.parse(response.syncedAt))
    && isValidSyncDocument(response.document);
}

async function createLocalDocument(theme: 'system' | 'light' | 'dark'): Promise<SyncDocument> {
  const [stopwatchRecords, resultHistory, favorites, tombstones] = await Promise.all([
    listStopwatchRecords(), listResultHistory(), listFavorites(), listSyncTombstones(),
  ]);
  return {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    settings: { theme },
    stopwatchRecords,
    resultHistory,
    favorites,
    tombstones,
  };
}

async function applyRemoteDocument(document: SyncDocument): Promise<void> {
  const [localRecords, localHistory, localFavorites] = await Promise.all([
    listStopwatchRecords(), listResultHistory(), listFavorites(),
  ]);
  const recordIds = new Set(document.stopwatchRecords.map((item) => item.id));
  const historyIds = new Set(document.resultHistory.map((item) => item.id));
  const historyUrls = new Set(document.resultHistory.map((item) => item.url));
  const favoriteIds = new Set(document.favorites.map((item) => item.id));
  const favoriteUrls = new Set(document.favorites.map((item) => item.url));

  for (const item of localRecords) if (!recordIds.has(item.id)) await deleteStopwatchRecord(item.id);
  for (const item of localHistory) if (!historyIds.has(item.id) && !historyUrls.has(item.url)) await deleteResultHistory(item.id);
  for (const item of localFavorites) if (!favoriteIds.has(item.id) && !favoriteUrls.has(item.url)) await deleteFavorite(item.id);

  for (const tombstone of document.tombstones) await saveSyncTombstone(tombstone);
  for (const item of document.stopwatchRecords) await saveStopwatchRecord(item);
  for (const item of document.resultHistory) await recordResultAction(item);
  for (const item of document.favorites) await saveFavorite(item);
}

export async function syncWithCloud(endpoint: string, theme: 'system' | 'light' | 'dark') {
  if (!isSafeWorkerUrl(endpoint)) throw new Error('同步服務網址未設定或不是有效的 HTTPS 網址。');

  const document = await createLocalDocument(theme);
  let response: Response;
  try {
    response = await fetch(endpoint.replace(/\/+$/, '') + '/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ action: 'sync', document }),
    });
  } catch {
    throw new Error('無法連線同步服務，請檢查網路或稍後再試。');
  }

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new Error('同步服務回應格式不正確。');
  }

  if (!response.ok || !validateResponse(result)) {
    const code = result && typeof result === 'object' && 'error' in result
      ? String((result as { error: unknown }).error)
      : '';
    throw new Error(ERROR_MESSAGES[code] ?? '同步失敗，請稍後再試。');
  }

  await applyRemoteDocument(result.document);
  return { syncedAt: result.syncedAt, document: result.document };
}
