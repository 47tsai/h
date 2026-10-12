import { describe, expect, it } from 'vitest';
import { convertInput, validateSourceRegistry, type SourceAdapter } from './converter';

const exampleSource: SourceAdapter = {
  id: 'example',
  label: 'Example',
  matchesInput: (input) => {
    try { return new URL(input).hostname === 'example.com'; } catch { return false; }
  },
  extractId: (input) => {
    if (!input.includes('://')) return input;
    const url = new URL(input);
    return url.pathname.match(/^\/item\/([^/]+)\/?$/)?.[1] ?? null;
  },
  isValidId: (id) => /^[A-Za-z0-9_-]{1,32}$/.test(id),
  buildUrl: (id) => `https://example.com/item/${encodeURIComponent(id)}`,
};

describe('converter core', () => {
  it('converts a recognized URL into a canonical URL', () => {
    expect(convertInput(' https://example.com/item/AbC_123?ref=old ', [exampleSource])).toEqual({
      ok: true,
      sourceId: 'example',
      sourceLabel: 'Example',
      inputId: 'AbC_123',
      url: 'https://example.com/item/AbC_123',
    });
  });

  it('allows manual source selection for a raw identifier', () => {
    expect(convertInput(' AbC-9 ', [exampleSource], 'example')).toMatchObject({
      ok: true,
      inputId: 'AbC-9',
      url: 'https://example.com/item/AbC-9',
    });
  });

  it('rejects blank, unknown, and unsupported selected sources', () => {
    expect(convertInput('  ', [exampleSource])).toMatchObject({ ok: false, code: 'empty-input' });
    expect(convertInput('https://unknown.example/x/1', [exampleSource])).toMatchObject({ ok: false, code: 'unknown-source' });
    expect(convertInput('123', [exampleSource], 'missing')).toMatchObject({ ok: false, code: 'source-not-found' });
  });

  it('asks for manual selection when multiple sources match', () => {
    const second = { ...exampleSource, id: 'example-2', label: 'Example 2' };
    expect(convertInput('https://example.com/item/1', [exampleSource, second])).toMatchObject({
      ok: false,
      code: 'ambiguous-source',
    });
  });

  it('rejects malformed identifiers and unsafe generated URLs', () => {
    expect(convertInput('https://example.com/item/contains%20space', [exampleSource])).toMatchObject({
      ok: false,
      code: 'invalid-id',
    });
    const unsafe = { ...exampleSource, buildUrl: () => 'javascript:alert(1)' };
    expect(convertInput('https://example.com/item/123', [unsafe])).toMatchObject({
      ok: false,
      code: 'invalid-generated-url',
    });
  });

  it('reports duplicate source IDs and missing labels', () => {
    const duplicate = { ...exampleSource, label: '' };
    expect(validateSourceRegistry([exampleSource, duplicate])).toEqual([
      '來源 ID 重複：example',
      '來源 example 缺少顯示名稱。',
    ]);
  });
});
