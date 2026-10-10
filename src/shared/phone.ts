/** DDDs válidos no Brasil. */
const VALID_DDDS = new Set([
  '11', '12', '13', '14', '15', '16', '17', '18', '19', '21', '22', '24', '27', '28',
  '31', '32', '33', '34', '35', '37', '38', '41', '42', '43', '44', '45', '46', '47',
  '48', '49', '51', '53', '54', '55', '61', '62', '63', '64', '65', '66', '67', '68',
  '69', '71', '73', '74', '75', '77', '79', '81', '82', '83', '84', '85', '86', '87',
  '88', '89', '91', '92', '93', '94', '95', '96', '97', '98', '99',
]);

export interface ParsedPhone {
  /** `+55DDDNÚMERO`, só dígitos; chave de deduplicação. */
  e164: string;
  /** Versão legível: (12) 3631-0000 ou (12) 99168-9416. */
  formatted: string;
  /** 9 dígitos após o DDD começando com 9. */
  isMobile: boolean;
}

/**
 * Normaliza um telefone brasileiro. Aceita o formato exibido no Maps, com
 * ou sem +55 e com zero de operadora. Retorna null para números sem DDD
 * (4004, 3003), 0800 e qualquer coisa que não pareça telefone fixo ou celular.
 */
export function parseBrazilianPhone(raw: string): ParsedPhone | null {
  let digits = raw.replace(/\D/g, '').replace(/^0+/, '');
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  }
  if (digits.length !== 10 && digits.length !== 11) return null;

  const ddd = digits.slice(0, 2);
  const subscriber = digits.slice(2);
  if (!VALID_DDDS.has(ddd)) return null;
  if (subscriber.length === 9 && subscriber[0] !== '9') return null;

  const split = subscriber.length - 4;
  return {
    e164: `+55${digits}`,
    formatted: `(${ddd}) ${subscriber.slice(0, split)}-${subscriber.slice(split)}`,
    isMobile: subscriber.length === 9,
  };
}
