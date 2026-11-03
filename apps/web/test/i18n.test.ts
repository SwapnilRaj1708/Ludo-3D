import { describe, expect, it } from 'vitest';
import en from '../messages/en.json';
import hi from '../messages/hi.json';
import zh from '../messages/zh-CN.json';
import { LOCALES, negotiateLocale } from '../src/i18n/config';

type Tree = { [k: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out.set(path, value);
    else for (const [k, v] of flatten(value, path)) out.set(k, v);
  }
  return out;
}

/** Top-level ICU argument names, e.g. "{name}" or "{count, plural, …}". */
function placeholders(message: string): string[] {
  const names = new Set<string>();
  let depth = 0;
  for (let i = 0; i < message.length; i++) {
    const ch = message[i];
    if (ch === '{') {
      if (depth === 0) {
        const match = /^\{\s*([A-Za-z0-9_]+)/.exec(message.slice(i));
        if (match) names.add(match[1]!);
      }
      depth++;
    } else if (ch === '}') depth--;
  }
  return [...names].sort();
}

const english = flatten(en as Tree);

describe.each([
  ['hi', hi],
  ['zh-CN', zh],
])('%s translations', (_locale, messages) => {
  const translated = flatten(messages as Tree);

  it('cover exactly the English keys', () => {
    expect([...translated.keys()].sort()).toEqual([...english.keys()].sort());
  });

  it('keep the same ICU placeholders', () => {
    for (const [key, value] of english) {
      expect(placeholders(translated.get(key) ?? ''), key).toEqual(placeholders(value));
    }
  });

  it('are actually translated (not copied English) for prose keys', () => {
    const same = [...english].filter(
      ([key, value]) =>
        translated.get(key) === value &&
        /[a-z]{4,}/.test(value) &&
        !key.startsWith('common.appName'),
    );
    // Brand names and units may legitimately match; everything else should differ.
    expect(same.map(([k]) => k)).toEqual(expect.arrayContaining([]));
    expect(same.length).toBeLessThanOrEqual(2);
  });
});

describe('locale negotiation', () => {
  it('maps browser preferences to supported locales', () => {
    expect(LOCALES).toEqual(['en', 'hi', 'zh-CN']);
    expect(negotiateLocale('hi-IN,hi;q=0.9,en;q=0.8')).toBe('hi');
    expect(negotiateLocale('zh-TW,zh;q=0.9')).toBe('zh-CN');
    expect(negotiateLocale('fr-FR,en;q=0.5')).toBe('en');
    expect(negotiateLocale('de-DE')).toBe('en');
    expect(negotiateLocale(null)).toBe('en');
  });
});
