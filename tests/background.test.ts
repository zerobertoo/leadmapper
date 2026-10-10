import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Lead, StatusReply } from '../src/shared/types';

type Listener = (message: unknown, sender: unknown, sendResponse: (reply?: unknown) => void) => unknown;

const MAPS_TAB = { id: 1, url: 'https://www.google.com/maps/search/dentista' };

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: crypto.randomUUID(),
    nome: 'Clínica Sorriso',
    categoria: '',
    nota: null,
    avaliacoes: null,
    endereco: 'Rua A, 10',
    telefone: '(12) 3631-0000',
    telefone_e164: '',
    eh_celular: false,
    site: '',
    dominio: '',
    emails: [],
    whatsapp: [],
    redes_sociais: [],
    url_maps: 'https://www.google.com/maps/place/x/data=!1s0x1:0x2',
    busca_origem: 'dentista',
    coletado_em: '2026-10-09T12:00:00.000Z',
    status_enriquecimento: 'sem_site',
    ...overrides,
  };
}

/** chrome.* mínimo, com storage em memória, para exercitar o service worker. */
function installChrome(initial: Record<string, unknown> = {}) {
  const store: Record<string, unknown> = { ...initial };
  const messageListeners: Listener[] = [];
  const alarmListeners: Array<(alarm: { name: string }) => unknown> = [];
  const badge = { text: '' };

  const pick = (keys: string | string[] | null) => {
    const names = keys === null ? Object.keys(store) : Array.isArray(keys) ? keys : [keys];
    return Object.fromEntries(names.filter((name) => name in store).map((name) => [name, store[name]]));
  };

  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: async (keys: string | string[] | null) => pick(keys),
        set: async (items: Record<string, unknown>) => void Object.assign(store, items),
        remove: async (keys: string | string[]) => {
          for (const key of Array.isArray(keys) ? keys : [keys]) delete store[key];
        },
      },
      onChanged: { addListener: vi.fn() },
    },
    runtime: { onMessage: { addListener: (listener: Listener) => messageListeners.push(listener) } },
    alarms: {
      create: vi.fn(),
      clear: vi.fn(),
      onAlarm: { addListener: (listener: (alarm: { name: string }) => unknown) => alarmListeners.push(listener) },
    },
    action: {
      setBadgeText: async ({ text }: { text: string }) => {
        badge.text = text;
      },
      setBadgeBackgroundColor: vi.fn(),
    },
    tabs: {
      query: async () => [MAPS_TAB],
      sendMessage: async () => ({ ok: true, hasResults: true, state: 'running' }),
    },
    scripting: { executeScript: vi.fn() },
  });

  const send = (message: unknown) =>
    new Promise<unknown>((resolve) => {
      const returned = messageListeners[0](message, {}, resolve);
      if (returned !== true) resolve(undefined);
    });

  return { store, badge, send, alarmListeners };
}

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

describe('service worker', () => {
  it('grava cada lead assim que chega, sem esperar um lote', async () => {
    const { store, send } = installChrome();
    await import('../src/background/index');

    await send({ type: 'LEAD_FOUND', lead: makeLead() });
    await vi.waitFor(() => expect(store.leads).toHaveLength(1));
  });

  it('limpa a lista inclusive o que ainda estava no buffer', async () => {
    const { store, send } = installChrome();
    await import('../src/background/index');
    await send({ type: 'LEAD_FOUND', lead: makeLead() });
    await vi.waitFor(() => expect(store.leads).toHaveLength(1));

    const reply = (await send({ type: 'CLEAR' })) as StatusReply;
    expect(reply).toMatchObject({ kind: 'ready', state: 'idle' });
    expect(store.leads).toBeUndefined();
  });

  it('START marca a coleta como em andamento e anota o horário de início', async () => {
    const { store, send } = installChrome();
    await import('../src/background/index');

    const reply = await send({ type: 'START', settings: { limit: 5 } });
    expect(reply).toMatchObject({ kind: 'ready', state: 'running' });
    expect(store.collectionState).toBe('running');
    expect(store.startedAt).toBeTypeOf('number');
  });

  it('DONE sem sites pendentes conclui a coleta e mostra OK no ícone', async () => {
    const { store, badge, send } = installChrome({ collectionState: 'running' });
    await import('../src/background/index');

    await send({ type: 'DONE', progress: { found: 1, processed: 1, withPhone: 1, failures: 0, skipped: 0, current: '' } });
    await vi.waitFor(() => expect(store.collectionState).toBe('done'));
    expect(badge.text).toBe('OK');
  });

  it('o alarme retoma a fila de sites com o popup fechado', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const response = new Response('<p>oi@clinica.com.br</p>', { headers: { 'content-type': 'text/html' } });
        Object.defineProperty(response, 'url', { value: 'https://clinica.com.br/' });
        return response;
      }),
    );
    const pending = makeLead({ site: 'https://clinica.com.br/', status_enriquecimento: 'pendente' });
    const { store, alarmListeners } = installChrome({
      collectionState: 'enriching',
      enrichSites: true,
      leads: [pending],
    });
    await import('../src/background/index');

    await alarmListeners[0]({ name: 'enrichment-watchdog' });
    await vi.waitFor(() => {
      const [lead] = store.leads as Lead[];
      expect(lead.status_enriquecimento).toBe('ok');
      expect(lead.emails).toEqual(['oi@clinica.com.br']);
    }, { timeout: 10_000 });
  }, 15_000);

  it('responde com erro, em vez de ficar mudo, quando o handler falha', async () => {
    const { send } = installChrome();
    vi.stubGlobal('chrome', {
      ...(globalThis as unknown as { chrome: object }).chrome,
      tabs: { query: async () => { throw new Error('sem permissão'); } },
    });
    await import('../src/background/index');
    expect(await send({ type: 'GET_STATUS' })).toMatchObject({ kind: 'error', message: 'sem permissão' });
  });
});
