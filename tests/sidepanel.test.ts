// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Lead } from '../src/shared/types';

const html = readFileSync(resolve(__dirname, '../src/sidepanel/sidepanel.html'), 'utf-8');

function makeLead(nome: string, overrides: Partial<Lead> = {}): Lead {
  return {
    id: `id-${nome}`,
    nome,
    categoria: '',
    nota: null,
    avaliacoes: null,
    endereco: '',
    telefone: '(12) 3631-0000',
    telefone_e164: '+551236310000',
    eh_celular: false,
    site: '',
    dominio: '',
    emails: [],
    whatsapp: [],
    redes_sociais: [],
    url_maps: 'https://www.google.com/maps/place/x',
    busca_origem: 'q',
    coletado_em: '2026-10-09T12:00:00.000Z',
    status_enriquecimento: 'sem_site',
    ...overrides,
  };
}

async function openPanel(leads: Lead[], options: Record<string, unknown> = {}) {
  const sendMessage = vi.fn(async () => undefined);
  const store: Record<string, unknown> = { leads, ...options };
  vi.stubGlobal('chrome', {
    storage: {
      local: { get: async (key: string) => ({ [key]: store[key] }) },
      onChanged: { addListener: vi.fn() },
    },
    runtime: { sendMessage },
  });
  document.body.innerHTML = html.match(/<body>([\s\S]*)<\/body>/)![1].replace(/<script[\s\S]*?<\/script>/g, '');
  // happy-dom não implementa showModal: o diálogo "responde" remover na hora
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.returnValue = 'remove';
    this.dispatchEvent(new Event('close'));
  };
  vi.resetModules();
  await import('../src/sidepanel/sidepanel');
  await vi.waitFor(() => expect(document.querySelectorAll('#rows tr').length).toBe(leads.length));
  return { sendMessage };
}

const checkRow = (index: number) => {
  const box = document.querySelectorAll<HTMLInputElement>('#rows input[type="checkbox"]')[index];
  box.checked = true;
  box.dispatchEvent(new Event('change'));
};

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('painel lateral', () => {
  it('remover atinge só os selecionados que o filtro mostra', async () => {
    const { sendMessage } = await openPanel([makeLead('Alfa'), makeLead('Beta'), makeLead('Gama')]);
    checkRow(0);
    checkRow(1);
    checkRow(2);

    const text = document.querySelector<HTMLInputElement>('#text')!;
    text.value = 'alfa';
    text.dispatchEvent(new Event('input'));
    document.querySelector<HTMLButtonElement>('#remove')!.click();

    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalled());
    expect(sendMessage).toHaveBeenCalledWith({ type: 'DELETE_LEADS', ids: ['id-Alfa'] });
  });

  it('mostra nome com HTML como texto, sem criar elementos', async () => {
    await openPanel([makeLead('<img src=x onerror=alert(1)>')]);
    expect(document.querySelector('#rows img')).toBeNull();
    expect(document.querySelector('#rows strong')!.textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it('só liga o link do Maps para https do Google', async () => {
    await openPanel([
      makeLead('Ruim', { url_maps: 'javascript:alert(1)' }),
      makeLead('Falso', { url_maps: 'https://www.google.com.evil.com/maps/x' }),
      makeLead('Bom', { url_maps: 'https://www.google.com/maps/place/x' }),
    ]);
    expect(document.querySelectorAll('#rows a')).toHaveLength(1);
  });

  it('a exportação respeita "só e-mails genéricos" das opções do popup', async () => {
    const { sendMessage } = await openPanel(
      [makeLead('Alfa', { emails: ['contato@alfa.com.br', 'joao.silva@alfa.com.br'] })],
      { options: { genericEmailsOnly: true } },
    );
    let exported = '';
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: (blob: Blob) => { void blob.text().then((t) => { exported = t; }); return 'blob:x'; }, revokeObjectURL: () => undefined }));
    document.querySelector<HTMLButtonElement>('#export')!.click();
    await vi.waitFor(() => expect(exported).toContain('contato@alfa.com.br'));
    expect(exported).not.toContain('joao.silva@alfa.com.br');
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
