import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export interface StopwatchRecord {
  id: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  title: string;
  createdAt: number;
}

interface HToolsDB extends DBSchema {
  'stopwatch-records': {
    key: string;
    value: StopwatchRecord;
    indexes: { 'by-createdAt': number };
  };
}

let databasePromise: Promise<IDBPDatabase<HToolsDB>> | undefined;

function getDatabase() {
  if (!globalThis.indexedDB) return Promise.reject(new Error('此環境不支援 IndexedDB，無法保存紀錄。'));
  databasePromise ??= openDB<HToolsDB>('h-tools', 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('stopwatch-records')) {
        const store = db.createObjectStore('stopwatch-records', { keyPath: 'id' });
        store.createIndex('by-createdAt', 'createdAt');
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
