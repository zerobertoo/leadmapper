import { describe, expect, it } from 'vitest';
import {
  classifyEmail,
  classifyEmailType,
  extractEmails,
  extractSocialProfiles,
  extractWhatsappNumbers,
  findContactPages,
  keepOwnEmails,
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

  it('não gruda sequências de escape de scripts no começo do e-mail', () => {
    const html = String.raw`{"text":"Fale\ncontato@zee-dog.com>comercial@zee-dog.com"}`;
    expect(extractEmails(html)).toEqual(['contato@zee-dog.com', 'comercial@zee-dog.com']);
  });

  it('descarta e-mails de exemplo em português e do WhatsApp', () => {
    expect(
      extractEmails('exemplo@exemplo.com mail@exemplo.com.br form-whats@whatsapp.com.br seuemail@email.com.br'),
    ).toEqual([]);
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

describe('e-mails de terceiros (agência, rede, modelo)', () => {
  it('ignora o crédito "desenvolvido por" ao lado do e-mail da agência', () => {
    const html = '<p>contato@clinica.com.br</p><footer>Desenvolvido por <a href="mailto:suporte@agencia.com.br">Agência</a></footer>';
    expect(extractEmails(html)).toEqual(['contato@clinica.com.br']);
  });

  it('classifica pelo domínio do site', () => {
    expect(classifyEmail('contato@clinica.com.br', 'clinica.com.br')).toBe('proprio');
    expect(classifyEmail('sac@petlandbr.com.br', 'petlandbrasil.com.br')).toBe('proprio');
    expect(classifyEmail('contato@zee-dog.com', 'zeedog.com.br')).toBe('proprio');
    expect(classifyEmail('lud.pet@hotmail.com', 'ludpetshop.wixsite.com')).toBe('pessoal');
    expect(classifyEmail('suporte@liguesites.com.br', 'villapetstore.com.br')).toBe('terceiro');
  });

  it('mantém próprio e pessoal, descarta terceiro, com o próprio primeiro', () => {
    expect(
      keepOwnEmails(['a@gmail.com', 'x@agencia.com.br', 'oi@loja.com.br'], 'loja.com.br'),
    ).toEqual(['oi@loja.com.br', 'a@gmail.com']);
  });
});

describe('validação de e-mail e tipo', () => {
  it('descarta TLD inexistente e parte local de 1 letra', () => {
    expect(extractEmails('n@crisvet.taki ncontato@zee-dog.com a@loja.com.br oi@loja.com.br')).toEqual([
      'ncontato@zee-dog.com',
      'oi@loja.com.br',
    ]);
  });

  it('separa e-mail genérico de e-mail de pessoa', () => {
    expect(classifyEmailType('contato@clinica.com.br')).toBe('generico');
    expect(classifyEmailType('fale.conosco@clinica.com.br')).toBe('generico');
    expect(classifyEmailType('joao.silva@clinica.com.br')).toBe('pessoal');
    expect(classifyEmailType('clinicasorriso@gmail.com')).toBe('generico');
  });
});
