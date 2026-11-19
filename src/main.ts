import './style.css';
import { Game, SHOP, TICK_MS, describeReq, newState, xpToNext, type ShopKey, type State } from './game';
import { connectSound } from './sound';
import { STORY } from './story';

const SAVE_KEY = 'lantern-road-save';

// ---------- save / load ----------

function load(): State | undefined {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return undefined;
    const s = JSON.parse(raw) as State;
    if (s.version !== 1 || !STORY[s.node]) return undefined;
    return { ...newState(), ...s };
  } catch {
    return undefined;
  }
}

function save(): void {
  game.s.lastSeen = Date.now();
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(game.s));
  } catch {
    /* storage unavailable: play without saving */
  }
}

const saved = load();
const game = new Game(saved);
connectSound(game);
(window as unknown as { game: Game }).game = game;

// ---------- dom helpers ----------

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const setBar = (id: string, frac: number) => ($(id).style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`);

const els = {
  journey: $('journey'),
  phase: $('phase'),
  title: $('node-title'),
  foe: $('foe'),
  foeName: $('foe-name'),
  foeHpText: $('foe-hp-text'),
  choice: $('choice'),
  prompt: $('prompt'),
  choices: $('choices'),
  autoNote: $('auto-note'),
  log: $('log'),
  level: $('level'),
  hpText: $('hp-text'),
  xpText: $('xp-text'),
  atk: $('atk'),
  def: $('def'),
  gold: $('gold'),
  potions: $('potions'),
  shop: $('shop'),
  record: $('record'),
  auto: $<HTMLInputElement>('auto'),
  toast: $('toast'),
};

const PHASE_LABEL = {
  travel: 'On the road',
  combat: 'In battle',
  rest: 'Resting at camp',
  choice: 'A choice awaits',
  defeat: 'Defeated',
} as const;

// ---------- shop ----------

const shopButtons = new Map<ShopKey, HTMLButtonElement>();
for (const key of Object.keys(SHOP) as ShopKey[]) {
  const btn = document.createElement('button');
  btn.className = 'shop-item';
  btn.addEventListener('click', () => {
    if (game.buy(key)) render();
  });
  shopButtons.set(key, btn);
  els.shop.append(btn);
}

// ---------- rendering ----------

let choiceKey = '';
let lastLogId = 0;

function renderChoices(): void {
  const s = game.s;
  const node = game.node;
  const key = s.phase === 'choice' ? `${s.node}|${node.choices.map((c) => game.canChoose(c)).join()}` : '';
  if (key === choiceKey) return;
  choiceKey = key;
  els.choice.hidden = !key;
  els.choices.replaceChildren();
  if (!key) return;
  els.prompt.textContent = node.prompt;
  node.choices.forEach((c, i) => {
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    const ok = game.canChoose(c);
    btn.disabled = !ok;
    btn.textContent = c.label;
    if (!ok) {
      const need = document.createElement('small');
      need.textContent = `Requires ${describeReq(c.requires)}`;
      btn.append(need);
    }
    btn.addEventListener('click', () => {
      game.choose(i);
      render();
    });
    els.choices.append(btn);
  });
}

function renderLog(): void {
  const fresh = game.s.log.filter((e) => e.id > lastLogId);
  if (!fresh.length) return;
  if (fresh[0].id !== lastLogId + 1) els.log.replaceChildren();
  for (const e of fresh) {
    const li = document.createElement('li');
    li.className = `log-${e.kind}`;
    li.textContent = e.text;
    els.log.prepend(li);
  }
  while (els.log.children.length > 40) els.log.lastElementChild?.remove();
  lastLogId = fresh[fresh.length - 1].id;
}

function render(): void {
  const s = game.s;
  const h = s.hero;
  const node = game.node;

  els.journey.textContent = `Journey ${s.journey + 1}`;
  els.phase.textContent = PHASE_LABEL[s.phase];
  els.title.textContent = node.title;
  setBar('travel-bar', s.step / node.steps);

  els.foe.hidden = !s.foe;
  if (s.foe) {
    els.foe.classList.toggle('boss', s.foe.boss);
    els.foeName.textContent = s.foe.name;
    els.foeHpText.textContent = `${s.foe.hp} / ${s.foe.maxHp}`;
    setBar('foe-hp', s.foe.hp / s.foe.maxHp);
  }

  renderChoices();
  els.autoNote.textContent =
    s.phase === 'choice' && s.autoChoose ? 'Auto-choose is on: the wanderer will decide in a moment.' : '';

  els.level.textContent = `Lv ${h.level}`;
  els.hpText.textContent = `${h.hp} / ${h.maxHp}`;
  setBar('hp-bar', h.hp / h.maxHp);
  const need = xpToNext(h.level);
  els.xpText.textContent = `${h.xp} / ${need}`;
  setBar('xp-bar', h.xp / need);
  els.atk.textContent = String(h.atk);
  els.def.textContent = String(h.def);
  els.gold.textContent = String(h.gold);
  els.potions.textContent = String(h.potions);

  for (const [key, btn] of shopButtons) {
    const item = SHOP[key];
    const cost = game.cost(key);
    btn.disabled = h.gold < cost;
    btn.innerHTML = '';
    const name = document.createElement('span');
    name.textContent = `${item.label}`;
    const desc = document.createElement('small');
    desc.textContent = item.desc;
    const price = document.createElement('span');
    price.className = 'price';
    price.textContent = `${cost}g`;
    const left = document.createElement('span');
    left.className = 'shop-text';
    left.append(name, desc);
    btn.append(left, price);
  }

  const st = s.stats;
  els.record.textContent = `${st.kills} foes slain · ${st.deaths} defeats · ${st.choices} choices · ${st.journeys} beacons lit`;
  els.auto.checked = s.autoChoose;
  renderLog();
}

// ---------- toast ----------

let toastTimer = 0;
function toast(text: string): void {
  els.toast.textContent = text;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (els.toast.hidden = true), 6000);
}

function catchUp(ms: number): void {
  if (ms < TICK_MS * 10) return;
  const r = game.catchUp(ms);
  if (!r.ticks) return;
  const mins = Math.round((r.ticks * TICK_MS) / 60000);
  const parts = [`+${r.gold} gold`, `+${r.xp} XP`, `${r.kills} foes slain`];
  if (r.levels) parts.push(`${r.levels} level${r.levels > 1 ? 's' : ''} gained`);
  if (r.deaths) parts.push(`${r.deaths} defeat${r.deaths > 1 ? 's' : ''}`);
  toast(
    `While you were away (${mins || '<1'} min): ${parts.join(', ')}.${r.stoppedAtChoice ? ' A choice is waiting for you.' : ''}`,
  );
}

// ---------- loop ----------

let speed = 1;
let timer = 0;

function setSpeed(next: number): void {
  speed = next;
  clearInterval(timer);
  if (speed > 0) timer = window.setInterval(() => {
    game.tick();
    render();
  }, TICK_MS / speed);
  document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((b) => {
    b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === speed));
  });
}

document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((b) =>
  b.addEventListener('click', () => setSpeed(Number(b.dataset.speed))),
);

els.auto.addEventListener('change', () => {
  game.s.autoChoose = els.auto.checked;
  render();
});

$('reset').addEventListener('click', () => {
  if (!confirm('Start a brand new wanderer? Your progress will be lost.')) return;
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
  location.reload();
});

// Offline progress when returning to a backgrounded tab, plus on first load.
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    hiddenAt = Date.now();
    clearInterval(timer);
    save();
  } else {
    if (hiddenAt) catchUp(Date.now() - hiddenAt);
    setSpeed(speed);
    render();
  }
});
window.addEventListener('pagehide', save);
setInterval(save, 5000);

if (saved) catchUp(Date.now() - saved.lastSeen);
render();
setSpeed(1);
