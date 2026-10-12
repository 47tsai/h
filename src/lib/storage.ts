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
  databasePromise ??= openDB<HToolsDB>('h-tools', 3, {
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
  await db.delete('stopwatch-records', id);
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
  await db.delete('result-history', id);
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
  await db.delete('favorites', id);
}
