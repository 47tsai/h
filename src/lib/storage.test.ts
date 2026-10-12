import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

describe('IndexedDB storage contract', () => {
  it('defines versioned storage and a timestamp index', async () => {
    const source = await readFile(new URL('./storage.ts', import.meta.url), 'utf8');
    expect(source).toContain("openDB<HToolsDB>('h-tools', 1");
    expect(source).toContain("createObjectStore('stopwatch-records'");
    expect(source).toContain("createIndex('by-createdAt', 'createdAt')");
  });

  it('stores elapsed duration and both timestamps in each record', async () => {
    const source = await readFile(new URL('./storage.ts', import.meta.url), 'utf8');
    expect(source).toContain('startedAt: number');
    expect(source).toContain('endedAt: number');
    expect(source).toContain('durationMs: number');
  });
});
