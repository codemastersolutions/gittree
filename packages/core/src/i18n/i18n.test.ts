import { describe, it, expect } from 'vitest';

import { I18n } from '../i18n/index.js';

describe('I18n', () => {
  it('resolves English key without params', () => {
    const i = new I18n('en');
    expect(i.t('common.done')).toBe('Done');
  });

  it('resolves Portuguese message with params', () => {
    const i = new I18n('pt-br');
    const msg = i.t('errors.dirtyWorktree', {
      path: '/tmp/x',
      count: 3,
    });
    expect(msg).toContain('/tmp/x');
    expect(msg).toContain('3');
    expect(msg).toContain('mudanças não commitadas');
  });

  it('falls back through the chain when key is missing in primary locale', () => {
    const i = new I18n('es');
    expect(i.t('common.done')).toBe('Hecho');
  });

  it('returns raw key when missing everywhere (fail-safe)', () => {
    const i = new I18n('en');
    expect(i.t('nonexistent.very.deep.key')).toBe('nonexistent.very.deep.key');
  });

  it('setPrimary swaps locale at runtime', () => {
    const i = new I18n('en');
    expect(i.t('common.done')).toBe('Done');
    i.setPrimary('pt-br');
    expect(i.t('common.done')).toBe('Concluído');
  });

  it('normalizes unknown locale into en', () => {
    const i = new I18n('fr' as never);
    expect(i.getPrimary()).toBe('en');
    expect(i.t('common.done')).toBe('Done');
  });
});
