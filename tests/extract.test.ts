import { describe, expect, it } from 'vitest';
import {
  extractEmails,
  extractSocialProfiles,
  extractWhatsappNumbers,
  findContactPages,
} from '../src/shared/extract';

describe('extractEmails', () => {
  it('extrai de mailto: e do texto, em minúsculas e sem repetir', () => {
    const html = `<a href="mailto:Contato@Clinica.com.br?subject=Oi">fale</a>
      <p>Escreva para contato@clinica.com.br ou financeiro@clinica.com.br</p>`;
    expect(extractEmails(html)).toEqual(['contato@clinica.com.br', 'financeiro@clinica.com.br']);
  });

  it('decodifica mailto com %40', () => {
    expect(extractEmails('<a href="mailto:vendas%40loja.com.br">x</a>')).toEqual(['vendas@loja.com.br']);
  });

  it('descarta imagens, domínios de exemplo e terceiros', () => {
    const html = `<img src="foto@2x.png"> <img src="logo@3x.webp">
      seu@example.com nome@dominio.com abc123@sentry.wixpress.com
      noreply@clinica.com.br real@clinica.com.br`;
    expect(extractEmails(html)).toEqual(['real@clinica.com.br']);
  });

  it('retorna lista vazia quando não há e-mail', () => {
    expect(extractEmails('<html><body>sem contato</body></html>')).toEqual([]);
  });
});

describe('extractWhatsappNumbers', () => {
  it('normaliza wa.me e api.whatsapp.com para formato internacional', () => {
    const html = `<a href="https://wa.me/5512991689416?text=Ola">zap</a>
      <a href="https://api.whatsapp.com/send?phone=5512991689416&amp;text=oi">zap</a>
      <a href="https://web.whatsapp.com/send?phone=+55 12 3631">x</a>
      <a href="https://wa.me/551236310000">fixo</a>`;
    expect(extractWhatsappNumbers(html)).toEqual(['+5512991689416', '+551236310000']);
  });

  it('aceita número sem 55 e ignora links sem número', () => {
    const html = `<a href="https://wa.me/12991689416">a</a><a href="https://wa.me/message/ABCDEF">b</a>`;
    expect(extractWhatsappNumbers(html)).toEqual(['+5512991689416']);
  });
});

describe('extractSocialProfiles', () => {
  it('pega o primeiro perfil de cada rede e ignora links de compartilhar', () => {
    const html = `<a href="https://www.facebook.com/sharer/sharer.php?u=x">compartilhar</a>
      <a href="https://www.instagram.com/clinicasorriso/">ig</a>
      <a href="https://facebook.com/clinicasorriso">fb</a>
      <a href="https://instagram.com/outro">outro</a>`;
    expect(extractSocialProfiles(html)).toEqual([
      'https://www.instagram.com/clinicasorriso',
      'https://www.facebook.com/clinicasorriso',
    ]);
  });
});

describe('findContactPages', () => {
  it('prioriza links de contato do mesmo site e completa com caminhos comuns', () => {
    const html = `<a href="/contato">Contato</a>
      <a href="https://outrosite.com/contato">fora</a>
      <a href="/sobre-nos">Sobre</a>
      <a href="/produtos">Produtos</a>`;
    expect(findContactPages(html, 'https://www.clinica.com.br/')).toEqual([
      'https://www.clinica.com.br/contato',
      'https://www.clinica.com.br/sobre-nos',
      'https://www.clinica.com.br/fale-conosco',
    ]);
  });

  it('usa só os caminhos comuns quando a home não tem links', () => {
    expect(findContactPages('<html></html>', 'https://clinica.com.br')).toEqual([
      'https://clinica.com.br/contato',
      'https://clinica.com.br/fale-conosco',
      'https://clinica.com.br/contact',
    ]);
  });
});
