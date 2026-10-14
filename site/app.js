// tema: sistema -> claro -> escuro, salvo no navegador
const root = document.documentElement;
const themeButton = document.getElementById('tema');
const themeLabel = document.getElementById('tema-rotulo');
const themeNames = { auto: 'Sistema', light: 'Claro', dark: 'Escuro' };
const themeCycle = ['auto', 'light', 'dark'];

function currentTheme() {
  return root.dataset.theme || 'auto';
}

function showTheme() {
  const theme = currentTheme();
  themeLabel.textContent = themeNames[theme];
  themeButton.setAttribute('aria-label', `Tema: ${themeNames[theme].toLowerCase()}. Clique para alternar.`);
}

themeButton.addEventListener('click', () => {
  const next = themeCycle[(themeCycle.indexOf(currentTheme()) + 1) % themeCycle.length];
  if (next === 'auto') delete root.dataset.theme;
  else root.dataset.theme = next;
  try {
    if (next === 'auto') localStorage.removeItem('leadmapper-theme');
    else localStorage.setItem('leadmapper-theme', next);
  } catch {}
  showTheme();
});
showTheme();

// demonstração: pinos e linhas da legenda aparecem em sequência
const demo = document.getElementById('demo');
const counter = document.getElementById('contador');
const startButton = document.getElementById('coletar');
const pins = demo.querySelectorAll('.pin');
const rows = demo.querySelectorAll('.row');
const stepDelay = 420;
let timers = [];

function runCollection() {
  timers.forEach(clearTimeout);
  timers = [];
  demo.classList.remove('is-running');
  void demo.getBoundingClientRect();
  demo.classList.add('is-running');
  counter.textContent = 'Coletando…';
  pins.forEach((_, index) => {
    timers.push(setTimeout(() => {
      counter.textContent = `${index + 1} ${index === 0 ? 'lead' : 'leads'}`;
    }, 500 + index * stepDelay));
  });
}

startButton.addEventListener('click', runCollection);
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) runCollection();

// liga cada pino à sua linha
function highlight(number, on) {
  demo.querySelectorAll(`[data-n="${number}"]`).forEach((element) => element.classList.toggle('on', on));
}
[...pins, ...rows].forEach((element) => {
  const number = element.dataset.n;
  element.addEventListener('mouseenter', () => highlight(number, true));
  element.addEventListener('mouseleave', () => highlight(number, false));
  element.addEventListener('focus', () => highlight(number, true));
  element.addEventListener('blur', () => highlight(number, false));
});
