import type { SourceAdapter } from './converter';

const youtube: SourceAdapter = {
  id: 'youtube-video',
  label: 'YouTube 影片',
  matchesInput(input) {
    try {
      const url = new URL(input);
      return ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtu.be'].includes(url.hostname);
    } catch {
      return false;
    }
  },
  extractId(input) {
    if (!input.includes('://')) return input;
    const url = new URL(input);
    if (url.hostname.endsWith('youtu.be')) return url.pathname.split('/').filter(Boolean)[0] ?? null;
    if (url.pathname === '/watch') return url.searchParams.get('v');
    const match = url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/);
    return match?.[1] ?? null;
  },
  isValidId(id) {
    return /^[A-Za-z0-9_-]{11}$/.test(id);
  },
  buildUrl(id) {
    return `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
  },
};

const bilibili: SourceAdapter = {
  id: 'bilibili-video',
  label: 'Bilibili 影片',
  matchesInput(input) {
    try {
      const url = new URL(input);
      return ['bilibili.com', 'www.bilibili.com', 'm.bilibili.com', 'b23.tv'].includes(url.hostname);
    } catch {
      return false;
    }
  },
  extractId(input) {
    if (!input.includes('://')) return input;
    const url = new URL(input);
    const match = url.pathname.match(/^\/video\/(BV[A-Za-z0-9]+)\/?$/i);
    if (match) return match[1];
    return null;
  },
  isValidId(id) {
    return /^BV[A-Za-z0-9]{10}$/.test(id);
  },
  buildUrl(id) {
    return `https://www.bilibili.com/video/${encodeURIComponent(id)}`;
  },
};

export const sourceRegistry: SourceAdapter[] = [youtube, bilibili];
