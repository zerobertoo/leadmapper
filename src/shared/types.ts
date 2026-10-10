/** Comandos de controle da coleta, enviados do popup até o content script. */
export type CollectionCommand = 'START' | 'PAUSE' | 'RESUME' | 'CANCEL';

/** Estado da coleta, persistido em chrome.storage.local. */
export type CollectionState =
  | 'idle'
  | 'running'
  // coleta do Maps terminou; falta visitar os sites das empresas
  | 'enriching'
  | 'paused'
  | 'done'
  | 'cancelled'
  // falha que impede a coleta; a mensagem fica em STORAGE_KEYS.errorMessage
  | 'error';

export type SpeedMode = 'slow' | 'normal' | 'fast';

export interface CollectionSettings {
  /** Máximo de empresas por coleta. */
  limit: number;
  /** Ajusta as pausas entre ações. */
  speed: SpeedMode;
  /** Visita o site de cada empresa para achar e-mail e WhatsApp. */
  enrichSites: boolean;
}

export const DEFAULT_SETTINGS: CollectionSettings = { limit: 120, speed: 'normal', enrichSites: true };

export type EnrichmentStatus = 'pendente' | 'ok' | 'sem_site' | 'erro';

/** Empresa coletada. Os nomes dos campos seguem o modelo de dados do PRD. */
export interface Lead {
  id: string;
  nome: string;
  categoria: string;
  nota: number | null;
  avaliacoes: number | null;
  endereco: string;
  telefone: string;
  telefone_e164: string;
  eh_celular: boolean;
  site: string;
  dominio: string;
  emails: string[];
  whatsapp: string[];
  redes_sociais: string[];
  url_maps: string;
  /** Links do Maps de cartões mesclados a este lead (para não revisitar). */
  urls_maps_extras?: string[];
  busca_origem: string;
  coletado_em: string;
  status_enriquecimento: EnrichmentStatus;
  /** Horário de funcionamento exibido no Maps, em uma linha (melhor esforço). */
  horario?: string;
  /** Ausente equivale a `novo`. */
  status_contato?: ContactStatus;
  tags?: string[];
  /** De onde veio cada dado e quando (RF4.2), para pedidos de titulares. */
  fontes?: Partial<Record<SourcedField, FieldSource>>;
}

export type SourcedField =
  | 'categoria'
  | 'endereco'
  | 'telefone'
  | 'site'
  | 'horario'
  | 'emails'
  | 'whatsapp'
  | 'redes_sociais';

/** Etapa do contato comercial com o lead, editada na lista do painel lateral. */
export type ContactStatus = 'novo' | 'contatado' | 'sem_interesse' | 'cliente';

export const CONTACT_STATUS_LABELS: Record<ContactStatus, string> = {
  novo: 'Novo',
  contatado: 'Contatado',
  sem_interesse: 'Sem interesse',
  cliente: 'Cliente',
};

/** Campos do lead que o usuário edita (status e tags). */
export interface LeadEdit {
  status_contato?: ContactStatus;
  tags?: string[];
}

export interface FieldSource {
  origem: 'maps' | 'site';
  /** ISO 8601 */
  em: string;
}

/** Contadores exibidos no popup. */
export interface Progress {
  /** Cartões encontrados na lista (limitado ao máximo da coleta). */
  found: number;
  /** Empresas já processadas (com sucesso ou falha). */
  processed: number;
  withPhone: number;
  failures: number;
  /** Empresas puladas por já estarem salvas (retomada ou busca sobreposta). */
  skipped: number;
  /** Nome da empresa em processamento (vazio fora da coleta). */
  current: string;
}

export const EMPTY_PROGRESS: Progress = {
  found: 0,
  processed: 0,
  withPhone: 0,
  failures: 0,
  skipped: 0,
  current: '',
};

/** Mensagens aceitas pelo service worker vindas do popup. */
export type PopupMessage =
  | { type: 'GET_STATUS' }
  | { type: 'START'; settings?: Partial<CollectionSettings> }
  | { type: Exclude<CollectionCommand, 'START'> }
  // apaga leads e contadores, inclusive o buffer do service worker
  | { type: 'CLEAR' }
  // edição pela lista do painel lateral; passa pelo service worker para serializar a gravação
  | { type: 'UPDATE_LEADS'; ids: string[]; edit: LeadEdit }
  | { type: 'DELETE_LEADS'; ids: string[] };

/** Eventos enviados pelo content script ao service worker. */
export type ContentEvent =
  | { type: 'LEAD_FOUND'; lead: Lead }
  | { type: 'PROGRESS'; progress: Progress }
  | { type: 'DONE'; progress: Progress }
  | { type: 'ERROR'; message: string; progress: Progress }
  // campo vazio em quase todos os itens: coleta segue, o popup mostra o aviso
  | { type: 'WARNING'; messages: string[] }
  // linha do log de diagnóstico local (falha de item, bloqueio etc.)
  | { type: 'LOG'; text: string };

/** Mensagens aceitas pelo content script vindas do service worker. */
export type ContentMessage =
  | { type: 'PING' }
  | { type: 'START'; settings: CollectionSettings }
  | { type: Exclude<CollectionCommand, 'START'> };

/** Resposta do content script a qualquer mensagem. */
export interface ContentReply {
  ok: true;
  /** Há uma lista de resultados de busca visível no Maps. */
  hasResults: boolean;
  /** Estado real da coleta na aba (pode divergir do storage se a aba recarregou). */
  state: CollectionState;
}

/** Resposta do service worker ao popup. */
export type StatusReply =
  | { kind: 'outside_maps' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; state: CollectionState; hasResults: boolean; errorMessage?: string };

export const STORAGE_KEYS = {
  state: 'collectionState',
  progress: 'progress',
  leads: 'leads',
  // duplicados mesclados desde o início da coleta atual
  duplicates: 'duplicates',
  errorMessage: 'errorMessage',
  // avisos de campos vazios na coleta atual (string[])
  warnings: 'warnings',
  // instante (ms) em que a coleta atual começou, para estimar o tempo restante
  startedAt: 'startedAt',
  // se os sites das empresas devem ser visitados na coleta atual
  enrichSites: 'enrichSites',
} as const;

/** Opções do popup, lembradas entre aberturas. Não são apagadas ao limpar a lista. */
export interface PopupOptions {
  limit: number;
  speed: SpeedMode;
  enrichSites: boolean;
  discardWithoutContact: boolean;
  exportScope: 'all' | 'current';
  /** Na exportação, mantém só e-mails genéricos (contato@, vendas@…). */
  genericEmailsOnly: boolean;
}

export const OPTIONS_STORAGE_KEY = 'options';

export const DEFAULT_OPTIONS: PopupOptions = {
  ...DEFAULT_SETTINGS,
  discardWithoutContact: false,
  exportScope: 'all',
  genericEmailsOnly: false,
};

/** Log de diagnóstico local: anel dos últimos eventos, fora de STORAGE_KEYS para sobreviver a "Limpar lista". */
export const LOG_STORAGE_KEY = 'diagnosticLog';
export const MAX_LOG_ENTRIES = 200;

export const MAX_LIMIT = 500;
