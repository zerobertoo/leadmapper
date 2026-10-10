import { describe, expect, it } from 'vitest';
import { extractDomain, isSocialDomain, placeKey } from '../src/shared/domain';

describe('placeKey', () => {
  it('usa o par de ids da empresa e ignora parâmetros de rastreamento', () => {
    const a = 'https://www.google.com/maps/place/Dra+Rafaela/data=!4m7!3m6!1s0x94ccf9d15d8ab613:0x8e56fdf1998e37db!8m2!3d-23.03';
    const b = 'https://www.google.com/maps/place/Dra+Rafaela+Silva/data=!4m7!3m6!1s0x94ccf9d15d8ab613:0x8e56fdf1998e37db?hl=pt-BR&entry=ttu';
    expect(placeKey(a)).toBe('0x94ccf9d15d8ab613:0x8e56fdf1998e37db');
    expect(placeKey(a)).toBe(placeKey(b));
  });

  it('cai no caminho da URL quando não há id', () => {
    expect(placeKey('https://www.google.com/maps/place/Loja?hl=pt-BR')).toBe(
      'https://www.google.com/maps/place/Loja',
    );
  });
});

describe('extractDomain e isSocialDomain', () => {
  it('remove www e reconhece redes sociais', () => {
    expect(extractDomain('https://WWW.Clinica.com.br/x')).toBe('clinica.com.br');
    expect(extractDomain('não é url')).toBe('');
    expect(isSocialDomain('instagram.com')).toBe(true);
    expect(isSocialDomain('l.facebook.com')).toBe(true);
    expect(isSocialDomain('clinica.com.br')).toBe(false);
  });
});
