import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export interface StopwatchRecord {
  id: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  title: string;
  createdAt: number;
}

export interface FavoriteItem {
  id: string;
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
  databasePromise ??= openDB<HToolsDB>('h-tools', 2, {
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
