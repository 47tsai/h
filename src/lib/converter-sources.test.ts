import { describe, expect, it } from 'vitest';
import { buildConversionResults, converterSources, sourceForUrl } from './converter-sources';

describe('converter source registry', () => {
  it('builds all matching numeric destinations by identifier length', () => {
    expect(buildConversionResults('123456', 'AUTO')).toEqual([
      { key: 'N', label: 'N 站', url: 'https://nhentai.net/g/123456' },
      { key: 'W', label: '紳士漫畫', url: 'https://www.wnacg.com/photos-slide-aid-123456.html' },
    ]);
    expect(buildConversionResults('1234567', 'AUTO').map((item) => item.key)).toEqual(['JM']);
    expect(buildConversionResults('12345678', 'AUTO').map((item) => item.key)).toEqual(['P']);
  });

  it('builds text destinations for non-numeric identifiers', () => {
    expect(buildConversionResults('AbC-123', 'AUTO')).toEqual([
      { key: 'M', label: 'missav', url: 'https://missav.ws/abc-123' },
      { key: 'J', label: 'Jable', url: 'https://jable.tv/videos/abc-123' },
    ]);
  });

  it('respects manual source selection and ignores incompatible ID kinds', () => {
    expect(buildConversionResults('123456', 'W').map((item) => item.key)).toEqual(['W']);
    expect(buildConversionResults('abc123', 'N')).toEqual([]);
    expect(buildConversionResults('abc123', 'missing')).toEqual([]);
    expect(buildConversionResults('   ', 'AUTO')).toEqual([]);
  });

  it('recognizes source hostnames without matching unrelated suffixes', () => {
    expect(sourceForUrl('https://www.pixiv.net/artworks/123')).toEqual({ key: 'P', label: 'Pixiv' });
    expect(sourceForUrl('https://sub.nhentai.net/g/123')).toEqual({ key: 'N', label: 'N 站' });
    expect(sourceForUrl('https://notpixiv.net/artworks/123')).toEqual({ key: 'notpixiv.net', label: 'notpixiv.net' });
    expect(sourceForUrl('not a url')).toEqual({ key: 'other', label: '其他網站' });
  });

  it('keeps all configured sources addressable', () => {
    expect(Object.keys(converterSources).sort()).toEqual(['J', 'JM', 'M', 'N', 'P', 'W']);
  });
});
