import './style.css';
import { Game, SHOP, TICK_MS, describeReq, newState, xpToNext, type ShopKey, type State } from './game';
import { connectSound } from './sound';
import { START_NODE, STORY } from './story';

const SAVE_KEY = 'lantern-road-save';
const SPEED_KEY = 'lantern-road-speed';

// ---------- save / load ----------

function load(): State | undefined {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<State>;
    if (parsed.version !== 1 || typeof parsed.node !== 'string' || !STORY[parsed.node]) return undefined;
    const fresh = newState();
    // Deep-merge the shape-critical objects so a half-written save can't take
    // the render loop down with it.
    const s: State = {
      ...fresh,
      ...parsed,
      hero: { ...fresh.hero, ...parsed.hero },
      bought: { ...fresh.bought, ...parsed.bought },
      stats: { ...fresh.stats, ...parsed.stats },
      log: Array.isArray(parsed.log) ? parsed.log.filter((e) => e && typeof e.text === 'string') : [],
      flags: Array.isArray(parsed.flags) ? parsed.flags : [],
    };
    if (!Number.isFinite(s.hero.hp) || !Number.isFinite(s.hero.atk) || s.hero.maxHp <= 0) return undefined;
    if (!STORY[s.checkpoint]) s.checkpoint = START_NODE;
    s.hero.hp = Math.max(0, Math.min(s.hero.maxHp, s.hero.hp));
    return s;
  } catch {
    return undefined;
  }
}

/** `force` writes even while the tab is hidden (used to mark the moment we stopped). */
function save(force = false): void {
  // A hidden tab is paused: its wall-clock gap is credited as offline progress
  // on return, so stamping `lastSeen` from a background timer would either
  // swallow that gap or hand it out twice.
  if (document.hidden && !force) return;
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
    if (game.buy(key)) dirty = true;
  });
  shopButtons.set(key, btn);
  els.shop.append(btn);
}
/** Last price/affordability painted for each shop button. */
const shopState = new Map<ShopKey, string>();

// ---------- rendering ----------

let choiceKey = '';
let lastLogId = 0;
/** Set whenever the game may have moved on; the frame loop repaints when it sees this. */
let dirty = true;

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
      dirty = true;
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
    const disabled = h.gold < cost;
    // Rebuilding four buttons sixty times a second buys nothing: only touch
    // the DOM when the price or affordability actually moved.
    const stamp = `${cost}|${disabled}`;
    if (shopState.get(key) === stamp) continue;
    shopState.set(key, stamp);
    btn.disabled = disabled;
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
  // Report the real time away: simulation can stop early at a waiting choice,
  // and "you were away 10 minutes (<1 min)" is a lie.
  const mins = Math.round(ms / 60000);
  const parts = [`+${r.gold} gold`, `+${r.xp} XP`, `${r.kills} foes slain`];
  if (r.levels) parts.push(`${r.levels} level${r.levels > 1 ? 's' : ''} gained`);
  if (r.deaths) parts.push(`${r.deaths} defeat${r.deaths > 1 ? 's' : ''}`);
  toast(
    `While you were away (${mins || '<1'} min): ${parts.join(', ')}.${r.stoppedAtChoice ? ' A choice is waiting for you.' : ''}`,
  );
}

// ---------- loop ----------

/**
 * The old loop restarted a `setInterval` on every speed change. Those timers
 * are clamped and drift, nothing could run faster than one tick per 175ms, and
 * every tick forced a full repaint. Time now accrues in an accumulator driven
 * by requestAnimationFrame: speed is exact, changing it is instant, fast
 * speeds simply spend several ticks in one frame, and the DOM is repainted
 * once per frame at most.
 */
const MAX_TICKS_PER_FRAME = 200;
/** A gap longer than this is a stall or a backgrounded tab, not game time. */
const MAX_FRAME_GAP_MS = 3000;

const speedBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-speed]'));

function loadSpeed(): number {
  try {
    const v = Number(localStorage.getItem(SPEED_KEY));
    return speedBtns.some((b) => Number(b.dataset.speed) === v) && v > 0 ? v : 1;
  } catch {
    return 1;
  }
}

let speed = loadSpeed();
let resumeSpeed = speed;
let lastFrame = 0;
let credit = 0;
let looping = false;

function setSpeed(next: number): void {
  speed = next;
  credit = 0; // never bank time across a speed change
  if (speed > 0) {
    resumeSpeed = speed;
    lastFrame = performance.now();
    try {
      localStorage.setItem(SPEED_KEY, String(speed));
    } catch {
      /* private mode: remember nothing */
    }
  }
  speedBtns.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === speed)));
  dirty = true;
}

function frame(now: number): void {
  window.requestAnimationFrame(frame);
  // While hidden, wall-clock time belongs to the visibilitychange handler (it
  // credits the gap as offline progress) — ticking here as well would count it
  // twice on some platforms.
  if (document.hidden) {
    lastFrame = now;
    return;
  }
  const dt = Math.min(Math.max(0, now - lastFrame), MAX_FRAME_GAP_MS);
  lastFrame = now;
  if (speed > 0) {
    credit += dt * speed;
    let ticks = 0;
    while (credit >= TICK_MS && ticks < MAX_TICKS_PER_FRAME) {
      game.tick();
      credit -= TICK_MS;
      ticks++;
    }
    if (credit >= TICK_MS) credit = 0; // stalled hard: drop the backlog rather than spin
    if (ticks) dirty = true;
  }
  if (dirty) {
    dirty = false;
    render();
  }
}

function startLoop(): void {
  if (looping) return;
  looping = true;
  lastFrame = performance.now();
  window.requestAnimationFrame(frame);
}

speedBtns.forEach((b) =>
  b.addEventListener('click', () => {
    setSpeed(Number(b.dataset.speed));
    // Leave focus on the page so Space keeps meaning "pause" after a click,
    // while Tab-focus still lets a keyboard user activate the button itself.
    b.blur();
  }),
);

/** Space toggles pause, digits 0-5 pick the speed buttons in order. */
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (e.code === 'Space') {
    // A focused button (tabbing through the UI) keeps Space as "activate".
    if (tag === 'BUTTON' || tag === 'A') return;
    e.preventDefault();
    setSpeed(speed > 0 ? 0 : resumeSpeed);
    return;
  }
  const i = Number(e.key);
  if (Number.isInteger(i) && i >= 0 && i < speedBtns.length) {
    setSpeed(Number(speedBtns[i].dataset.speed));
  }
});

els.auto.addEventListener('change', () => {
  game.s.autoChoose = els.auto.checked;
  dirty = true;
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
// requestAnimationFrame stops on its own while the tab is hidden, so the loop
// needs no start/stop here — only the wall-clock gap has to be settled.
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    hiddenAt = Date.now();
    save(true);
  } else if (hiddenAt) {
    const away = Date.now() - hiddenAt;
    hiddenAt = 0;
    credit = 0; // the gap is credited below, not by the next frame
    lastFrame = performance.now();
    catchUp(away);
    save(true);
    dirty = true;
  }
});
window.addEventListener('pagehide', () => save(true));
setInterval(save, 5000);

if (saved) catchUp(Date.now() - saved.lastSeen);
dirty = true;
setSpeed(speed);
startLoop();
