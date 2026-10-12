const MAX_BODY_BYTES = 800 * 1024;
const MAX_ITEMS = 10000;
const MAX_RETRIES = 3;
const ALLOWED_ENTITIES = ['stopwatchRecords', 'resultHistory', 'favorites'];

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...(origin ? {
        'access-control-allow-origin': origin,
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'content-type',
        'access-control-max-age': '600',
        'vary': 'Origin',
      } : {}),
    },
  });
}

function fail(error, status, origin) {
  return json({ ok: false, error }, status, origin);
}

function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function base64ToText(value) {
  const binary = atob(value.replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

function safeInteger(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validItem(entity, value) {
  if (!isPlainObject(value) || typeof value.id !== 'string' || !value.id || value.id.length > 200) return false;
  if (entity === 'stopwatchRecords') {
    return typeof value.title === 'string' && value.title.length <= 500
      && safeInteger(value.startedAt) && safeInteger(value.endedAt)
      && safeInteger(value.durationMs) && safeInteger(value.createdAt);
  }
  if (entity === 'resultHistory') {
    return isSafeHttpUrl(value.url) && typeof value.source === 'string' && value.source.length <= 200
      && typeof value.sourceLabel === 'string' && value.sourceLabel.length <= 500
      && ['open', 'copy', 'share'].includes(value.lastAction)
      && safeInteger(value.lastActionAt) && safeInteger(value.createdAt);
  }
  if (entity === 'favorites') {
    return isSafeHttpUrl(value.url) && typeof value.title === 'string' && value.title.length <= 500
      && (value.source === undefined || (typeof value.source === 'string' && value.source.length <= 200))
      && (value.notes === undefined || (typeof value.notes === 'string' && value.notes.length <= 5000))
      && safeInteger(value.createdAt) && safeInteger(value.updatedAt);
  }
  return false;
}

function isSafeHttpUrl(value) {
  if (typeof value !== 'string' || value.length > 4096) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function validateDocument(doc) {
  if (!isPlainObject(doc) || doc.schemaVersion !== 1 || typeof doc.updatedAt !== 'string'
    || !Number.isFinite(Date.parse(doc.updatedAt))) return false;
  for (const entity of ALLOWED_ENTITIES) {
    if (!Array.isArray(doc[entity]) || doc[entity].length > MAX_ITEMS
      || !doc[entity].every((item) => validItem(entity, item))) return false;
  }
  if (!Array.isArray(doc.tombstones) || doc.tombstones.length > MAX_ITEMS * 3) return false;
  if (!doc.tombstones.every((item) => isPlainObject(item)
    && ALLOWED_ENTITIES.includes(item.entity)
    && typeof item.id === 'string' && item.id.length > 0 && item.id.length <= 200
    && item.key === item.entity + ':' + item.id
    && safeInteger(item.deletedAt))) return false;
  const settings = doc.settings ?? {};
  if (!isPlainObject(settings) || Object.keys(settings).some((key) => key !== 'theme')
    || (settings.theme !== undefined && !['system', 'light', 'dark'].includes(settings.theme))) return false;
  return true;
}

function itemTimestamp(entity, item) {
  if (entity === 'stopwatchRecords') return item.createdAt;
  if (entity === 'resultHistory') return item.lastActionAt;
  return item.updatedAt;
}

function mergeDocuments(local, remote) {
  const tombstoneMap = new Map();
  for (const tombstone of [...(remote?.tombstones ?? []), ...(local.tombstones ?? [])]) {
    const current = tombstoneMap.get(tombstone.key);
    if (!current || tombstone.deletedAt > current.deletedAt) tombstoneMap.set(tombstone.key, tombstone);
  }
  const tombstones = [...tombstoneMap.values()];
  const deleted = new Set(tombstones.map((item) => item.key));
  const merged = { schemaVersion: 1, updatedAt: new Date().toISOString(), settings: {}, tombstones };

  for (const entity of ALLOWED_ENTITIES) {
    const byId = new Map();
    for (const item of [...(remote?.[entity] ?? []), ...(local[entity] ?? [])]) {
      if (deleted.has(entity + ':' + item.id)) continue;
      const current = byId.get(item.id);
      if (!current || itemTimestamp(entity, item) > itemTimestamp(entity, current)) byId.set(item.id, item);
    }
    let items = [...byId.values()];
    if (entity === 'favorites') {
      const byUrl = new Map();
      for (const item of items) {
        const current = byUrl.get(item.url);
        if (!current) byUrl.set(item.url, item);
        else if (item.updatedAt > current.updatedAt) {
          byUrl.set(item.url, { ...item, id: current.id, createdAt: Math.min(item.createdAt, current.createdAt) });
        } else {
          byUrl.set(item.url, { ...current, createdAt: Math.min(item.createdAt, current.createdAt) });
        }
      }
      items = [...byUrl.values()];
    }
    if (entity === 'resultHistory') {
      const byUrl = new Map();
      for (const item of items) {
        const current = byUrl.get(item.url);
        if (!current || item.lastActionAt > current.lastActionAt) {
          byUrl.set(item.url, current ? { ...item, id: current.id, createdAt: Math.min(item.createdAt, current.createdAt) } : item);
        } else {
          byUrl.set(item.url, { ...current, createdAt: Math.min(item.createdAt, current.createdAt) });
        }
      }
      items = [...byUrl.values()];
    }
    if (items.length > MAX_ITEMS) throw new Error('TOO_MANY_ITEMS');
    merged[entity] = items;
  }
  const localTheme = local.settings?.theme;
  const remoteTheme = remote?.settings?.theme;
  merged.settings = { ...(remoteTheme ? { theme: remoteTheme } : {}), ...(localTheme ? { theme: localTheme } : {}) };
  if (tombstones.length > MAX_ITEMS * 3) throw new Error('TOO_MANY_ITEMS');
  return merged;
}

async function githubRequest(env, method, body, sha) {
  const owner = env.GITHUB_OWNER;
  const repo = env.GITHUB_REPO;
  const branch = env.GITHUB_BRANCH || 'main';
  const path = env.GITHUB_FILE_PATH || 'data/sync.json';
  if (![owner, repo, branch, path].every((part) => typeof part === 'string' && part.length > 0)
    || path.startsWith('/') || path.split('/').some((part) => part === '..')) {
    throw new Error('CONFIGURATION_ERROR');
  }
  const url = 'https://api.github.com/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo)
    + '/contents/' + encodePath(path);
  const headers = {
    authorization: 'Bearer ' + env.GITHUB_TOKEN,
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    'user-agent': 'H-Tools-Cloud-Sync',
  };
  const response = await fetch(method === 'GET' ? url + '?ref=' + encodeURIComponent(branch) : url, {
    method,
    headers: { ...headers, ...(method === 'PUT' ? { 'content-type': 'application/json' } : {}) },
    ...(method === 'PUT' ? { body: JSON.stringify({
      message: 'Sync H Tools data',
      content: bytesToBase64(new TextEncoder().encode(JSON.stringify(body, null, 2))),
      branch,
      ...(sha ? { sha } : {}),
    }) } : {}),
  });
  if (method === 'GET' && response.status === 404) return { document: null, sha: null };
  if (method === 'GET' && response.ok) {
    const result = await response.json();
    try {
      const document = JSON.parse(base64ToText(result.content));
      if (!validateDocument(document)) throw new Error('INVALID_REMOTE_DOCUMENT');
      return { document, sha: result.sha };
    } catch (error) {
      if (error instanceof Error && error.message === 'INVALID_REMOTE_DOCUMENT') throw error;
      throw new Error('INVALID_REMOTE_DOCUMENT');
    }
  }
  if (method === 'PUT' && response.ok) {
    const result = await response.json();
    return { sha: result.content?.sha ?? null };
  }
  if (response.status === 409 || response.status === 422) throw new Error('GITHUB_CONFLICT');
  if (response.status === 401 || response.status === 403 || response.status === 404) throw new Error('GITHUB_PERMISSION_ERROR');
  if (response.status === 429) throw new Error('GITHUB_RATE_LIMITED');
  throw new Error('GITHUB_UNAVAILABLE');
}

function clientError(error) {
  if (error?.message === 'INVALID_REMOTE_DOCUMENT') return ['REMOTE_DATA_INVALID', 500];
  if (error?.message === 'GITHUB_CONFLICT') return ['SYNC_CONFLICT', 409];
  if (error?.message === 'GITHUB_RATE_LIMITED') return ['GITHUB_RATE_LIMITED', 429];
  if (error?.message === 'GITHUB_PERMISSION_ERROR') return ['GITHUB_PERMISSION_ERROR', 502];
  if (error?.message === 'CONFIGURATION_ERROR') return ['SERVER_NOT_CONFIGURED', 500];
  if (error?.message === 'TOO_MANY_ITEMS') return ['TOO_MANY_ITEMS', 413];
  return ['GITHUB_UNAVAILABLE', 502];
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin');
    const allowedOrigin = env.ALLOWED_ORIGIN;
    if (!allowedOrigin || origin !== allowedOrigin) return fail('ORIGIN_NOT_ALLOWED', 403);
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': allowedOrigin,
          'access-control-allow-methods': 'POST, OPTIONS',
          'access-control-allow-headers': 'content-type',
          'access-control-max-age': '600',
          'vary': 'Origin',
        },
      });
    }
    const url = new URL(request.url);
    if (request.method !== 'POST') return fail('METHOD_NOT_ALLOWED', 405, allowedOrigin);
    if (url.pathname !== '/api/sync') return fail('NOT_FOUND', 404, allowedOrigin);
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
      return fail('BAD_REQUEST', 400, allowedOrigin);
    }
    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > MAX_BODY_BYTES) return fail('PAYLOAD_TOO_LARGE', 413, allowedOrigin);
    let raw;
    try {
      raw = await request.text();
      if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return fail('PAYLOAD_TOO_LARGE', 413, allowedOrigin);
    } catch {
      return fail('BAD_REQUEST', 400, allowedOrigin);
    }
    let payload;
    try { payload = JSON.parse(raw); } catch { return fail('BAD_REQUEST', 400, allowedOrigin); }
    if (!isPlainObject(payload) || payload.action !== 'sync') return fail('BAD_REQUEST', 400, allowedOrigin);

    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    if (env.SYNC_LIMITER && !(await env.SYNC_LIMITER.limit({ key: ip })).success) {
      return fail('RATE_LIMITED', 429, allowedOrigin);
    }
    if (!validateDocument(payload.document)) return fail('BAD_REQUEST', 400, allowedOrigin);

    let local = payload.document;
    try {
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const remote = await githubRequest(env, 'GET');
        const merged = mergeDocuments(local, remote.document);
        if (!validateDocument(merged)) return fail('BAD_REQUEST', 400, allowedOrigin);
        if (new TextEncoder().encode(JSON.stringify(merged)).byteLength > MAX_BODY_BYTES) {
          return fail('PAYLOAD_TOO_LARGE', 413, allowedOrigin);
        }
        try {
          const saved = await githubRequest(env, 'PUT', merged, remote.sha);
          return json({ ok: true, document: merged, sha: saved.sha, syncedAt: new Date().toISOString() }, 200, allowedOrigin);
        } catch (error) {
          if (error?.message !== 'GITHUB_CONFLICT' || attempt === MAX_RETRIES - 1) throw error;
          local = merged;
        }
      }
      return fail('SYNC_CONFLICT', 409, allowedOrigin);
    } catch (error) {
      const [code, status] = clientError(error);
      return fail(code, status, allowedOrigin);
    }
  },
};
