import { describe, expect, it } from 'vitest';
import { enrichSite } from '../src/background/enrich';

const noWait = () => Promise.resolve();

function htmlResponse(html: string, url: string): Response {
  const response = new Response(html, { headers: { 'content-type': 'text/html' } });
  Object.defineProperty(response, 'url', { value: url });
  return response;
}

describe('enrichSite', () => {
  it('junta e-mail e WhatsApp da home e das páginas de contato', async () => {
    const pages: Record<string, string> = {
      'https://clinica.com.br/': '<a href="/contato">Contato</a> oi@clinica.com.br',
      'https://clinica.com.br/contato': '<a href="https://wa.me/5512991689416">zap</a>',
    };
    const fetchImpl = (async (url: string) =>
      url in pages ? htmlResponse(pages[url], url) : new Response('', { status: 404 })) as typeof fetch;

    const result = await enrichSite('https://clinica.com.br/', { fetchImpl, waitTurn: noWait });
    expect(result).toMatchObject({
      status: 'ok',
      emails: ['oi@clinica.com.br'],
      whatsapp: ['+5512991689416'],
    });
  });

  it('tenta de novo uma vez em falha de rede', async () => {
    let calls = 0;
    const fetchImpl = (async (url: string) => {
      calls++;
      if (calls === 1) throw new TypeError('network');
      return htmlResponse('', url);
    }) as typeof fetch;

    const result = await enrichSite('https://clinica.com.br/', { fetchImpl, waitTurn: noWait });
    expect(result.status).toBe('ok');
  });

  it('marca erro quando a home não carrega', async () => {
    const fetchImpl = (async () => {
      throw new TypeError('network');
    }) as typeof fetch;

    const result = await enrichSite('https://clinica.com.br/', { fetchImpl, waitTurn: noWait });
    expect(result).toEqual({ emails: [], whatsapp: [], redes_sociais: [], status: 'erro' });
  });
});
