import { describe, expect, it } from 'vitest';
import { extractDomain, isNonWebsite, isSocialDomain, placeId, placeKey } from '../src/shared/domain';

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

describe('placeId e isNonWebsite', () => {
  it('lê o id do Maps ou devolve null', () => {
    expect(placeId('https://www.google.com/maps/place/X/data=!1s0x94cc:0xAB!8m2')).toBe('0x94cc:0xab');
    expect(placeId('https://www.google.com/maps/place/X')).toBeNull();
  });

  it('reconhece redes sociais e WhatsApp como não-site', () => {
    expect(isNonWebsite('https://www.instagram.com/x')).toBe(true);
    expect(isNonWebsite('https://wa.me/5512999999999')).toBe(true);
    expect(isNonWebsite('https://api.whatsapp.com/send?phone=5512999999999')).toBe(true);
    expect(isNonWebsite('https://clinica.com.br')).toBe(false);
  });
});
