import type { GitLocale } from '../adapters/types.js';

type DeepStringRecord = { readonly [key: string]: string | DeepStringRecord };

import EN_IMPORT from '../locales/en.json' with { type: 'json' };
import PT_BR_IMPORT from '../locales/pt-br.json' with { type: 'json' };
import ES_IMPORT from '../locales/es.json' with { type: 'json' };

const EN: DeepStringRecord = EN_IMPORT as DeepStringRecord;
const PT_BR: DeepStringRecord = PT_BR_IMPORT as DeepStringRecord;
const ES: DeepStringRecord = ES_IMPORT as DeepStringRecord;

const CATALOGS: Readonly<Record<GitLocale, DeepStringRecord>> = {
  en: EN,
  'pt-br': PT_BR,
  es: ES,
};

const FALLBACK_CHAIN: readonly GitLocale[] = ['en', 'pt-br', 'es'];

function resolveKey(catalog: DeepStringRecord, dottedKey: string): string | undefined {
  const parts = dottedKey.split('.');
  let node: DeepStringRecord | string = catalog;
  for (const part of parts) {
    if (typeof node === 'string') {
      return undefined;
    }
    const next: DeepStringRecord | string | undefined = node[part];
    if (next === undefined) {
      return undefined;
    }
    node = next;
  }
  return typeof node === 'string' ? node : undefined;
}

function applyParams(template: string, params: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = params[key];
    return value === undefined ? match : String(value);
  });
}

export class I18n {
  private readonly primary: GitLocale;

  public constructor(locale: GitLocale = 'en') {
    this.primary = this.normalize(locale);
  }

  public t(key: string, params: Readonly<Record<string, string | number>> = {}): string {
    const chain = this.buildChain();
    for (const locale of chain) {
      const template = resolveKey(CATALOGS[locale] ?? CATALOGS.en, key);
      if (template !== undefined) {
        return applyParams(template, params);
      }
    }
    return key;
  }

  public setPrimary(locale: GitLocale): void {
    const self = this as unknown as { primary: GitLocale };
    self.primary = this.normalize(locale);
  }

  public getPrimary(): GitLocale {
    return this.primary;
  }

  private normalize(locale: GitLocale): GitLocale {
    const lower = locale.toLowerCase() as GitLocale;
    if (lower === 'en' || lower === 'pt-br' || lower === 'es') {
      return lower;
    }
    return 'en';
  }

  private buildChain(): readonly GitLocale[] {
    if (this.primary === 'en') {
      return FALLBACK_CHAIN;
    }
    const without = FALLBACK_CHAIN.filter((l) => l !== this.primary);
    return [this.primary, ...without];
  }
}
