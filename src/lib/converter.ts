export interface SourceAdapter {
  /** Stable, unique identifier used by settings and history. */
  id: string;
  /** Human-readable source name. */
  label: string;
  /** Return true only when this source can confidently recognize the input. */
  matchesInput(input: string): boolean;
  /** Extract the source-specific identifier from a raw ID or recognized URL. */
  extractId(input: string): string | null;
  /** Validate an extracted identifier before URL generation. */
  isValidId(id: string): boolean;
  /** Build the canonical destination URL for a validated identifier. */
  buildUrl(id: string): string;
}

export type ConversionErrorCode =
  | 'empty-input'
  | 'unknown-source'
  | 'source-not-found'
  | 'ambiguous-source'
  | 'id-not-found'
  | 'invalid-id'
  | 'invalid-generated-url';

export type ConversionResult =
  | { ok: true; sourceId: string; sourceLabel: string; inputId: string; url: string }
  | { ok: false; code: ConversionErrorCode; message: string };

const messages: Record<ConversionErrorCode, string> = {
  'empty-input': '請先輸入編號或網址。',
  'unknown-source': '無法自動識別來源，請手動選擇已支援的來源。',
  'source-not-found': '選擇的來源尚未註冊或不受支援。',
  'ambiguous-source': '這個輸入符合多個來源，請手動選擇來源。',
  'id-not-found': '無法從輸入內容取得有效編號。',
  'invalid-id': '編號格式不符合此來源的規則。',
  'invalid-generated-url': '來源產生了無效或不安全的網址，已取消轉換。',
};

export function validateSourceRegistry(adapters: SourceAdapter[]): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  for (const adapter of adapters) {
    if (!adapter.id.trim()) issues.push('來源 ID 不可為空。');
    else if (ids.has(adapter.id)) issues.push(`來源 ID 重複：${adapter.id}`);
    ids.add(adapter.id);
    if (!adapter.label.trim()) issues.push(`來源 ${adapter.id || '(empty)'} 缺少顯示名稱。`);
    for (const field of ['matchesInput', 'extractId', 'isValidId', 'buildUrl'] as const) {
      if (typeof adapter[field] !== 'function') issues.push(`來源 ${adapter.id || '(empty)'} 缺少 ${field} 函式。`);
    }
  }
  return issues;
}

function safeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function convertInput(
  rawInput: string,
  adapters: SourceAdapter[],
  selectedSourceId?: string,
): ConversionResult {
  const input = rawInput.trim();
  if (!input) return { ok: false, code: 'empty-input', message: messages['empty-input'] };

  let source: SourceAdapter | undefined;
  if (selectedSourceId) {
    source = adapters.find((adapter) => adapter.id === selectedSourceId);
    if (!source) return { ok: false, code: 'source-not-found', message: messages['source-not-found'] };
  } else {
    const candidates = adapters.filter((adapter) => {
      try { return adapter.matchesInput(input); } catch { return false; }
    });
    if (candidates.length === 0) return { ok: false, code: 'unknown-source', message: messages['unknown-source'] };
    if (candidates.length > 1) return { ok: false, code: 'ambiguous-source', message: messages['ambiguous-source'] };
    source = candidates[0];
  }

  let id: string | null;
  try { id = source.extractId(input); } catch { id = null; }
  if (typeof id !== 'string' || !id.trim()) {
    return { ok: false, code: 'id-not-found', message: messages['id-not-found'] };
  }
  id = id.trim();

  let validId = false;
  try { validId = source.isValidId(id); } catch { validId = false; }
  if (!validId) return { ok: false, code: 'invalid-id', message: messages['invalid-id'] };

  let url: string;
  try { url = source.buildUrl(id); } catch {
    return { ok: false, code: 'invalid-generated-url', message: messages['invalid-generated-url'] };
  }
  if (!safeHttpUrl(url)) {
    return { ok: false, code: 'invalid-generated-url', message: messages['invalid-generated-url'] };
  }

  return { ok: true, sourceId: source.id, sourceLabel: source.label, inputId: id, url };
}
