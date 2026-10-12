export interface ConverterSource {
  label: string;
  domain: string;
  buildUrl: (id: string) => string;
}

/** Supported destination formats used by conversion and history/favorites labels. */
export const converterSources: Record<string, ConverterSource> = {
  N: { label: 'N 站', domain: 'nhentai.net', buildUrl: (id) => `https://nhentai.net/g/${id}` },
  W: { label: '紳士漫畫', domain: 'wnacg.com', buildUrl: (id) => `https://www.wnacg.com/photos-slide-aid-${id}.html` },
  JM: { label: '禁漫天堂', domain: '18comic.vip', buildUrl: (id) => `https://18comic.vip/photo/${id}` },
  P: { label: 'Pixiv', domain: 'pixiv.net', buildUrl: (id) => `https://www.pixiv.net/artworks/${id}` },
  M: { label: 'missav', domain: 'missav.ws', buildUrl: (id) => `https://missav.ws/${encodeURIComponent(id.toLowerCase())}` },
  J: { label: 'Jable', domain: 'jable.tv', buildUrl: (id) => `https://jable.tv/videos/${encodeURIComponent(id.toLowerCase())}` },
};

export function sourceForUrl(url: string): { key: string; label: string } {
  try {
    const host = new URL(url).hostname.toLowerCase();
    const found = Object.entries(converterSources).find(([, source]) =>
      host === source.domain || host.endsWith('.' + source.domain),
    );
    return found ? { key: found[0], label: found[1].label } : { key: host, label: host };
  } catch {
    return { key: 'other', label: '其他網站' };
  }
}
