import { en } from './i18n/en';
import { pt, type MessageKey } from './i18n/pt';

export type { MessageKey };

/** Idioma da interface: português quando o navegador está em pt-*, inglês nos demais (pt se não houver `chrome`). */
export const locale: 'pt' | 'en' = (
  globalThis.chrome?.i18n?.getUILanguage?.() ?? 'pt-BR'
)
  .toLowerCase()
  .startsWith('pt')
  ? 'pt'
  : 'en';

const dictionary: Record<MessageKey, string> = locale === 'pt' ? pt : en;

/** Texto traduzido, com `{nome}` trocado pelos valores de `values`. */
export function t(key: MessageKey, values: Record<string, string | number> = {}): string {
  return dictionary[key].replace(/\{(\w+)\}/g, (_match, name: string) => String(values[name] ?? ''));
}

/** Aplica `data-i18n`, `data-i18n-aria-label` e `data-i18n-placeholder` e ajusta o `lang` da página. */
export function applyI18n(root: Document = document): void {
  root.documentElement.lang = locale === 'pt' ? 'pt-BR' : 'en';
  for (const element of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
    element.textContent = t(element.dataset.i18n as MessageKey);
  }
  for (const element of root.querySelectorAll<HTMLElement>('[data-i18n-aria-label]')) {
    element.setAttribute('aria-label', t(element.dataset.i18nAriaLabel as MessageKey));
  }
  for (const element of root.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]')) {
    element.placeholder = t(element.dataset.i18nPlaceholder as MessageKey);
  }
}
