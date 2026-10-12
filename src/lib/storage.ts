import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export interface StopwatchRecord {
  id: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  title: string;
  createdAt: number;
}

export interface ResultHistoryItem {
  id: string;
  url: string;
  source: string;
  sourceLabel: string;
  lastAction: 'open' | 'copy' | 'share';
  lastActionAt: number;
  createdAt: number;
}

export type SyncEntity = 'stopwatchRecords' | 'resultHistory' | 'favorites';

export interface SyncTombstone {
  key: string;
  entity: SyncEntity;
  id: string;
  deletedAt: number;
}

export interface FavoriteItem {
  id: string;
  source?: string;
  url: string;
  title: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

interface HToolsDB extends DBSchema {
  'stopwatch-records': {
    key: string;
    value: StopwatchRecord;
    indexes: { 'by-createdAt': number };
  };
  favorites: {
    key: string;
    value: FavoriteItem;
    indexes: { 'by-createdAt': number; 'by-title': string };
  };
  'result-history': {
    key: string;
    value: ResultHistoryItem;
    indexes: { 'by-lastActionAt': number; 'by-url': string };
  };
  'sync-tombstones': {
    key: string;
    value: SyncTombstone;
  };
}

let databasePromise: Promise<IDBPDatabase<HToolsDB>> | undefined;

export async function closeStorageDatabase(): Promise<void> {
  const current = databasePromise;
  databasePromise = undefined;
  if (current) {
    const db = await current;
    db.close();
  }
}

function getDatabase() {
  if (!globalThis.indexedDB) return Promise.reject(new Error('此環境不支援 IndexedDB，無法保存紀錄。'));
  databasePromise ??= openDB<HToolsDB>('h-tools', 4, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1 && !db.objectStoreNames.contains('stopwatch-records')) {
        const store = db.createObjectStore('stopwatch-records', { keyPath: 'id' });
        store.createIndex('by-createdAt', 'createdAt');
      }
      if (oldVersion < 2 && !db.objectStoreNames.contains('favorites')) {
        const store = db.createObjectStore('favorites', { keyPath: 'id' });
        store.createIndex('by-createdAt', 'createdAt');
        store.createIndex('by-title', 'title');
      }
      if (oldVersion < 3 && !db.objectStoreNames.contains('result-history')) {
        const store = db.createObjectStore('result-history', { keyPath: 'id' });
        store.createIndex('by-lastActionAt', 'lastActionAt');
        store.createIndex('by-url', 'url', { unique: true });
      }
      if (oldVersion < 4 && !db.objectStoreNames.contains('sync-tombstones')) {
        db.createObjectStore('sync-tombstones', { keyPath: 'key' });
      }
    },
  });
  return databasePromise;
}

export async function listStopwatchRecords(): Promise<StopwatchRecord[]> {
  const db = await getDatabase();
  return (await db.getAllFromIndex('stopwatch-records', 'by-createdAt')).reverse();
}
export async function saveStopwatchRecord(record: StopwatchRecord): Promise<void> {
  const db = await getDatabase();
  await db.put('stopwatch-records', record);
}
export async function deleteStopwatchRecord(id: string): Promise<void> {
  const db = await getDatabase();
  const tx = db.transaction(['stopwatch-records', 'sync-tombstones'], 'readwrite');
  await tx.objectStore('stopwatch-records').delete(id);
  await tx.objectStore('sync-tombstones').put({ key: `stopwatchRecords:${id}`, entity: 'stopwatchRecords', id, deletedAt: Date.now() });
  await tx.done;
}

export async function listResultHistory(): Promise<ResultHistoryItem[]> {
  const db = await getDatabase();
  return (await db.getAllFromIndex('result-history', 'by-lastActionAt')).reverse();
}
export async function recordResultAction(item: ResultHistoryItem): Promise<void> {
  const db = await getDatabase();
  const existing = await db.getFromIndex('result-history', 'by-url', item.url);
  await db.put('result-history', { ...item, id: existing?.id ?? item.id, createdAt: existing?.createdAt ?? item.createdAt });
}
export async function deleteResultHistory(id: string): Promise<void> {
  const db = await getDatabase();
  const tx = db.transaction(['result-history', 'sync-tombstones'], 'readwrite');
  await tx.objectStore('result-history').delete(id);
  await tx.objectStore('sync-tombstones').put({ key: `resultHistory:${id}`, entity: 'resultHistory', id, deletedAt: Date.now() });
  await tx.done;
}

export async function listFavorites(): Promise<FavoriteItem[]> {
  const db = await getDatabase();
  return (await db.getAllFromIndex('favorites', 'by-createdAt')).reverse();
}
export async function saveFavorite(item: FavoriteItem): Promise<void> {
  const db = await getDatabase();
  await db.put('favorites', item);
}
export async function deleteFavorite(id: string): Promise<void> {
  const db = await getDatabase();
  const tx = db.transaction(['favorites', 'sync-tombstones'], 'readwrite');
  await tx.objectStore('favorites').delete(id);
  await tx.objectStore('sync-tombstones').put({ key: `favorites:${id}`, entity: 'favorites', id, deletedAt: Date.now() });
  await tx.done;
}

export async function listSyncTombstones(): Promise<SyncTombstone[]> {
  const db = await getDatabase();
  return db.getAll('sync-tombstones');
}

export async function saveSyncTombstone(tombstone: SyncTombstone): Promise<void> {
  const db = await getDatabase();
  const current = await db.get('sync-tombstones', tombstone.key);
  if (!current || tombstone.deletedAt > current.deletedAt) await db.put('sync-tombstones', tombstone);
}

export async function importBackupData(
  importedRecords: StopwatchRecord[],
  importedHistory: ResultHistoryItem[],
  importedFavorites: FavoriteItem[],
): Promise<void> {
  if (!Array.isArray(importedRecords) || !Array.isArray(importedHistory) || !Array.isArray(importedFavorites)
    || importedRecords.length > 10000 || importedHistory.length > 10000 || importedFavorites.length > 10000) {
    throw new Error('備份資料結構不正確，或單一類型資料超過 10,000 筆。');
  }
  const isObject = (item: unknown): item is Record<string, unknown> =>
    Boolean(item && typeof item === 'object' && !Array.isArray(item));
  const hasValidId = (item: unknown): item is Record<string, unknown> =>
    isObject(item) && typeof item.id === 'string' && item.id.trim().length > 0 && item.id.length <= 200;
  const isTimestamp = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
  const isSafeHttpUrl = (value: unknown): value is string => {
    if (typeof value !== 'string' || value.length > 4096) return false;
    try {
      const url = new URL(value);
      return (url.protocol === 'https:' || url.protocol === 'http:') && Boolean(url.hostname)
        && !url.username && !url.password;
    } catch {
      return false;
    }
  };
  const validRecord = (value: unknown): value is StopwatchRecord => hasValidId(value)
    && typeof value.title === 'string' && value.title.length <= 500
    && isTimestamp(value.startedAt) && isTimestamp(value.endedAt)
    && isTimestamp(value.durationMs) && isTimestamp(value.createdAt);
  const validHistory = (value: unknown): value is ResultHistoryItem => hasValidId(value)
    && isSafeHttpUrl(value.url)
    && typeof value.source === 'string' && value.source.length <= 200
    && typeof value.sourceLabel === 'string' && value.sourceLabel.length <= 500
    && ['open', 'copy', 'share'].includes(String(value.lastAction))
    && isTimestamp(value.lastActionAt) && isTimestamp(value.createdAt);
  const validFavorite = (value: unknown): value is FavoriteItem => hasValidId(value)
    && isSafeHttpUrl(value.url)
    && typeof value.title === 'string' && value.title.length <= 500
    && (value.source === undefined || (typeof value.source === 'string' && value.source.length <= 200))
    && (value.notes === undefined || (typeof value.notes === 'string' && value.notes.length <= 5000))
    && isTimestamp(value.createdAt) && isTimestamp(value.updatedAt);
  const hasUniqueIds = (items: { id: string }[]) => new Set(items.map((item) => item.id)).size === items.length;
  const hasUniqueUrls = (items: { url: string }[]) => new Set(items.map((item) => item.url)).size === items.length;
  if (!importedRecords.every(validRecord) || !importedHistory.every(validHistory) || !importedFavorites.every(validFavorite)
    || !hasUniqueIds(importedRecords) || !hasUniqueIds(importedHistory) || !hasUniqueIds(importedFavorites)
    || !hasUniqueUrls(importedHistory) || !hasUniqueUrls(importedFavorites)) {
    throw new Error('備份包含無效或重複的欄位、ID 或網址，未匯入任何內容。');
  }

  const db = await getDatabase();
  const tx = db.transaction(
    ['stopwatch-records', 'result-history', 'favorites', 'sync-tombstones'],
    'readwrite',
  );
  const recordsStore = tx.objectStore('stopwatch-records');
  const historyStore = tx.objectStore('result-history');
  const favoritesStore = tx.objectStore('favorites');
  const tombstonesStore = tx.objectStore('sync-tombstones');

  try {
    const [currentHistory, currentFavorites] = await Promise.all([
      historyStore.getAll(),
      favoritesStore.getAll(),
    ]);
    const historyByUrl = new Map(currentHistory.map((item) => [item.url, item]));
    const historyById = new Map(currentHistory.map((item) => [item.id, item]));
    const favoriteByUrl = new Map(currentFavorites.map((item) => [item.url, item]));
    const favoriteById = new Map(currentFavorites.map((item) => [item.id, item]));
    const writes: Promise<unknown>[] = [];

    for (const item of importedRecords) {
      writes.push(recordsStore.put(item));
      writes.push(tombstonesStore.delete(`stopwatchRecords:${item.id}`));
    }

    for (const item of importedHistory) {
      const existingByUrl = historyByUrl.get(item.url);
      const idInUse = historyById.get(item.id);
      const saved: ResultHistoryItem = {
        ...item,
        id: existingByUrl?.id ?? (idInUse && idInUse.url !== item.url ? crypto.randomUUID() : item.id),
        createdAt: existingByUrl?.createdAt ?? item.createdAt,
      };
      writes.push(historyStore.put(saved));
      writes.push(tombstonesStore.delete(`resultHistory:${saved.id}`));
      historyByUrl.set(saved.url, saved);
      historyById.set(saved.id, saved);
    }

    for (const item of importedFavorites) {
      const existingByUrl = favoriteByUrl.get(item.url);
      const idInUse = favoriteById.get(item.id);
      const saved: FavoriteItem = {
        ...item,
        id: existingByUrl?.id ?? (idInUse && idInUse.url !== item.url ? crypto.randomUUID() : item.id),
        createdAt: existingByUrl?.createdAt ?? item.createdAt,
      };
      writes.push(favoritesStore.put(saved));
      writes.push(tombstonesStore.delete(`favorites:${saved.id}`));
      favoriteByUrl.set(saved.url, saved);
      favoriteById.set(saved.id, saved);
    }

    await Promise.all(writes);
    await tx.done;
  } catch (error) {
    try { tx.abort(); } catch { /* The transaction may already have completed or aborted. */ }
    await tx.done.catch(() => undefined);
    throw error;
  }
}

