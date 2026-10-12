import { describe, expect, it } from 'vitest';
import { convertInput } from './converter';
import { sourceRegistry } from './sourceRegistry';

describe('registered video sources', () => {
  it('normalizes YouTube watch, short, shorts, and embed URLs', () => {
    const cases = [
      'https://www.youtube.com/watch?v=aqz-KE-bpKQ&t=30',
      'https://youtu.be/aqz-KE-bpKQ',
      'https://www.youtube.com/shorts/aqz-KE-bpKQ',
      'https://www.youtube.com/embed/aqz-KE-bpKQ',
    ];
    for (const input of cases) {
      expect(convertInput(input, sourceRegistry)).toMatchObject({
        ok: true,
        sourceId: 'youtube-video',
        inputId: 'aqz-KE-bpKQ',
        url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
      });
    }
  });

  it('converts a YouTube raw ID only when the source is selected', () => {
    expect(convertInput('aqz-KE-bpKQ', sourceRegistry)).toMatchObject({
      ok: false,
      code: 'unknown-source',
    });
    expect(convertInput('aqz-KE-bpKQ', sourceRegistry, 'youtube-video')).toMatchObject({
      ok: true,
      url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
    });
  });

  it('normalizes Bilibili BV URLs and raw IDs', () => {
    const id = 'BV1xx411c7mD';
    expect(convertInput(`https://www.bilibili.com/video/${id}/?spm_id_from=333`, sourceRegistry)).toMatchObject({
      ok: true,
      sourceId: 'bilibili-video',
      inputId: id,
      url: `https://www.bilibili.com/video/${id}`,
    });
    expect(convertInput(id, sourceRegistry, 'bilibili-video')).toMatchObject({
      ok: true,
      url: `https://www.bilibili.com/video/${id}`,
    });
  });

  it('rejects a URL from another domain even if a source is manually selected', () => {
    expect(convertInput('https://evil.example/watch?v=aqz-KE-bpKQ', sourceRegistry, 'youtube-video')).toMatchObject({
      ok: false,
      code: 'id-not-found',
    });
  });

  it('does not claim short links can be converted without resolving them', () => {
    expect(convertInput('https://b23.tv/abc123', sourceRegistry)).toMatchObject({
      ok: false,
      code: 'unknown-source',
    });
  });
});
