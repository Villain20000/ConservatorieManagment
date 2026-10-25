/// <reference types="node" />
// `apps/web` has no `@types/node` of its own; the repo root does, and the
// explicit reference is what lets `tsconfig.spec.json` (which pins
// `types: ["vitest/globals"]`) resolve `node:fs` for this spec.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Greek and English are the only shipped locales. Transloco falls back
 * silently, so a key that exists in `el.json` but not `en.json` shows a raw
 * dot-path to the user instead of throwing — this spec is the only tripwire.
 */
const LOCALES = ['el', 'en'] as const;
type Locale = (typeof LOCALES)[number];

/**
 * Resolved from the working directory rather than `import.meta.url`: under the
 * Angular test builder that URL is an http:// dev-server address, and
 * `fileURLToPath` rejects it. `ng test` runs from `apps/web`, while a direct
 * Vitest invocation may run from the repo root, so both are tried.
 */
const I18N_CANDIDATES = ['public/assets/i18n', 'apps/web/public/assets/i18n'];

function i18nDir(): string {
  for (const candidate of I18N_CANDIDATES) {
    const dir = resolve(process.cwd(), candidate);
    if (existsSync(join(dir, 'el.json'))) return dir;
  }
  throw new Error(
    `Cannot locate public/assets/i18n from ${process.cwd()}. Tried: ${I18N_CANDIDATES.join(', ')}`,
  );
}

/** Leaves are strings, numbers, booleans, null, arrays and empty objects. */
function flatten(value: unknown, prefix: string, into: Map<string, unknown>): void {
  if (Array.isArray(value)) {
    into.set(prefix, value);
    return;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      into.set(prefix, value);
      return;
    }
    for (const [key, child] of entries) {
      flatten(child, prefix ? `${prefix}.${key}` : key, into);
    }
    return;
  }
  into.set(prefix, value);
}

function load(locale: Locale): Map<string, unknown> {
  const file = join(i18nDir(), `${locale}.json`);
  if (!existsSync(file)) {
    throw new Error(`Cannot find ${locale}.json at ${file}.`);
  }
  const keys = new Map<string, unknown>();
  flatten(JSON.parse(readFileSync(file, 'utf8')) as unknown, '', keys);
  return keys;
}

/** `{{ name }}` and `{{count}}` both yield `count` / `name`. */
function placeholders(text: string): string[] {
  return [...text.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map((match) => match[1].trim()).sort();
}

function describeDiff(label: string, keys: string[]): string {
  if (keys.length === 0) return `${label}: none`;
  return `${label} (${keys.length}):\n  ${keys.join('\n  ')}`;
}

const catalogues = new Map<Locale, Map<string, unknown>>(
  LOCALES.map((locale) => [locale, load(locale)]),
);

describe('i18n catalogues', () => {
  it('exposes the same key set in every locale', () => {
    const [reference, ...others] = LOCALES;
    const referenceKeys = catalogues.get(reference) as Map<string, unknown>;

    for (const locale of others) {
      const keys = catalogues.get(locale) as Map<string, unknown>;
      const missingFromLocale = [...referenceKeys.keys()]
        .filter((key) => !keys.has(key))
        .sort();
      const missingFromReference = [...keys.keys()]
        .filter((key) => !referenceKeys.has(key))
        .sort();

      expect(
        missingFromLocale,
        `\nKey parity broken between ${reference}.json and ${locale}.json\n` +
          `${describeDiff(`present in ${reference}.json, missing from ${locale}.json`, missingFromLocale)}\n` +
          `${describeDiff(`present in ${locale}.json, missing from ${reference}.json`, missingFromReference)}\n`,
      ).toEqual([]);
      expect(missingFromReference, `Keys only in ${locale}.json`).toEqual([]);
    }
  });

  it('has no empty strings or TODO placeholders', () => {
    for (const locale of LOCALES) {
      const keys = catalogues.get(locale) as Map<string, unknown>;
      const blank: string[] = [];
      const todo: string[] = [];

      for (const [key, value] of keys) {
        if (typeof value !== 'string') continue;
        if (value.trim() === '') blank.push(key);
        if (/\bTODO\b/i.test(value)) todo.push(key);
      }

      const blankKeys = blank.sort();
      const todoKeys = todo.sort();
      expect(blankKeys, `\n${describeDiff(`empty values in ${locale}.json`, blankKeys)}\n`).toEqual(
        [],
      );
      expect(todoKeys, `\n${describeDiff(`TODO placeholders in ${locale}.json`, todoKeys)}\n`).toEqual(
        [],
      );
    }
  });

  it('uses the same interpolation placeholders for each shared key', () => {
    const [reference, ...others] = LOCALES;
    const referenceKeys = catalogues.get(reference) as Map<string, unknown>;

    for (const locale of others) {
      const keys = catalogues.get(locale) as Map<string, unknown>;
      const mismatches: string[] = [];

      for (const [key, value] of referenceKeys) {
        const other = keys.get(key);
        if (other === undefined || typeof value !== 'string' || typeof other !== 'string') continue;

        const expected = placeholders(value);
        const actual = placeholders(other);
        if (expected.join('\u0000') !== actual.join('\u0000')) {
          mismatches.push(
            `${key}: ${reference}.json expects [${expected.join(', ')}], ` +
              `${locale}.json has [${actual.join(', ')}]`,
          );
        }
      }

      expect(
        mismatches.sort(),
        `\nInterpolation mismatch between ${reference}.json and ${locale}.json\n` +
          `${describeDiff('mismatched keys', mismatches.sort())}\n`,
      ).toEqual([]);
    }
  });
});
