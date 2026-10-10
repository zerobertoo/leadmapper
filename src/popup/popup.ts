import type { PopupMessage, StatusReply } from '../shared/types';

const statusElement = document.querySelector<HTMLParagraphElement>('#status')!;
const buttons = {
  start: document.querySelector<HTMLButtonElement>('#start')!,
  pause: document.querySelector<HTMLButtonElement>('#pause')!,
  resume: document.querySelector<HTMLButtonElement>('#resume')!,
  cancel: document.querySelector<HTMLButtonElement>('#cancel')!,
};

function send(message: PopupMessage): Promise<StatusReply> {
  return chrome.runtime.sendMessage<PopupMessage, StatusReply>(message);
}

// mostra apenas os botões válidos para o estado atual
function render(reply: StatusReply): void {
  const { start, pause, resume, cancel } = buttons;
  start.hidden = false;
  pause.hidden = resume.hidden = cancel.hidden = true;
  start.disabled = true;

  if (reply.kind === 'outside_maps') {
    statusElement.textContent = 'Abra uma busca no Google Maps para começar.';
  } else if (reply.kind === 'error') {
    statusElement.textContent = `Algo deu errado: ${reply.message}. Recarregue a aba do Maps e tente de novo.`;
  } else if (reply.state === 'running') {
    statusElement.textContent = 'Coletando…';
    start.hidden = true;
    pause.hidden = cancel.hidden = false;
  } else if (reply.state === 'paused') {
    statusElement.textContent = 'Coleta pausada.';
    start.hidden = true;
    resume.hidden = cancel.hidden = false;
  } else if (!reply.hasResults) {
    statusElement.textContent = 'Faça uma busca no Maps e espere a lista de resultados aparecer.';
  } else {
    statusElement.textContent = 'Pronto para coletar.';
    start.disabled = false;
  }
}

async function run(message: PopupMessage): Promise<void> {
  render(await send(message));
}

buttons.start.addEventListener('click', () => void run({ type: 'START' }));
buttons.pause.addEventListener('click', () => void run({ type: 'PAUSE' }));
buttons.resume.addEventListener('click', () => void run({ type: 'RESUME' }));
buttons.cancel.addEventListener('click', () => void run({ type: 'CANCEL' }));

void run({ type: 'GET_STATUS' });
