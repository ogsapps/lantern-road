import { Emitter } from './events';
import { ENEMIES, START_NODE, STORY, type Choice, type Effect, type Req, type StoryNode } from './story';

export type Phase = 'travel' | 'combat' | 'rest' | 'choice' | 'defeat';
export type LogKind = 'story' | 'combat' | 'loot' | 'level' | 'bad' | 'info';

export interface Hero {
  level: number;
  xp: number;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  gold: number;
  potions: number;
}

export interface Foe {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  xp: number;
  gold: number;
  boss: boolean;
}

export interface LogEntry {
  id: number;
  text: string;
  kind: LogKind;
}

export type ShopKey = 'atk' | 'def' | 'hp' | 'potion';

export interface State {
  version: 1;
  hero: Hero;
  bought: Record<ShopKey, number>;
  node: string;
  checkpoint: string;
  phase: Phase;
  step: number;
  bossDone: boolean;
  foe: Foe | null;
  flags: string[];
  journey: number;
  log: LogEntry[];
  logSeq: number;
  wait: number;
  autoChoose: boolean;
  stats: { kills: number; deaths: number; choices: number; journeys: number };
  lastSeen: number;
}

/** Every moment worth a sound. Subscribe with game.events.on(name, fn). */
export type GameEvents = {
  arrive: { node: string; title: string };
  step: { node: string; step: number; steps: number };
  foeAppear: { foe: Foe };
  heroHit: { damage: number; crit: boolean; foe: Foe };
  heroHurt: { damage: number; hp: number; maxHp: number };
  foeDefeated: { foe: Foe };
  loot: { gold: number; potion: boolean };
  potion: { healed: number };
  levelUp: { level: number };
  restStart: Record<string, never>;
  restEnd: Record<string, never>;
  choiceShown: { node: string };
  choiceMade: { node: string; label: string };
  defeat: { goldLost: number };
  respawn: { node: string };
  purchase: { item: ShopKey; cost: number };
  journeyComplete: { journey: number };
};

export const TICK_MS = 700;
const LOG_LIMIT = 80;
const AUTO_CHOOSE_TICKS = 5;
const DEFEAT_TICKS = 4;
/** Offline progress is capped at 8 hours. */
const MAX_OFFLINE_TICKS = Math.floor((8 * 3600 * 1000) / TICK_MS);

export const SHOP: Record<ShopKey, { label: string; desc: string; base: number; growth: number }> = {
  atk: { label: 'Sharpen blade', desc: '+2 ATK', base: 20, growth: 1.5 },
  def: { label: 'Mend armor', desc: '+1 DEF', base: 20, growth: 1.5 },
  hp: { label: 'Train endurance', desc: '+10 Max HP', base: 15, growth: 1.4 },
  potion: { label: 'Buy potion', desc: 'Auto-used below 35% HP', base: 10, growth: 1 },
};

export function xpToNext(level: number): number {
  return Math.round(12 * Math.pow(level, 1.6));
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

function damage(atk: number, def: number): number {
  return Math.max(1, Math.round(atk * rand(0.85, 1.15) - def * 0.5));
}

const FLAVOR = [
  'The road winds on.',
  'Your lantern sputters, then steadies.',
  'You hum an old marching song.',
  'Crows argue somewhere overhead.',
  'You pass a cairn of stones and add one of your own.',
  'The wind changes direction.',
];

export function newState(): State {
  return {
    version: 1,
    hero: { level: 1, xp: 0, hp: 40, maxHp: 40, atk: 6, def: 1, gold: 0, potions: 1 },
    bought: { atk: 0, def: 0, hp: 0, potion: 0 },
    node: START_NODE,
    checkpoint: START_NODE,
    phase: 'travel',
    step: 0,
    bossDone: false,
    foe: null,
    flags: [],
    journey: 0,
    log: [],
    logSeq: 0,
    wait: 0,
    autoChoose: false,
    stats: { kills: 0, deaths: 0, choices: 0, journeys: 0 },
    lastSeen: Date.now(),
  };
}

export interface CatchUpSummary {
  ticks: number;
  gold: number;
  xp: number;
  levels: number;
  kills: number;
  deaths: number;
  stoppedAtChoice: boolean;
}

export class Game {
  readonly events = new Emitter<GameEvents>();
  s: State;

  constructor(state?: State) {
    this.s = state ?? newState();
    if (!state) this.arrive(START_NODE);
  }

  get node(): StoryNode {
    return STORY[this.s.node];
  }

  /** Difficulty and reward multiplier for the current journey. */
  get scale(): number {
    return Math.pow(1.8, this.s.journey);
  }

  /** Gold grows slower than difficulty so the shop can't outpace the road. */
  get goldScale(): number {
    return Math.pow(1.35, this.s.journey);
  }

  // ---------- main loop ----------

  tick(): void {
    switch (this.s.phase) {
      case 'travel':
        return this.travel();
      case 'combat':
        return this.combat();
      case 'rest':
        return this.rest();
      case 'choice':
        return this.waitForChoice();
      case 'defeat':
        return this.defeated();
    }
  }

  private travel(): void {
    const s = this.s;
    const n = this.node;
    if (s.step >= n.steps) {
      if (n.boss && !s.bossDone) {
        this.spawn(n.boss, true);
        return;
      }
      this.showChoice();
      return;
    }
    s.step++;
    this.events.emit('step', { node: s.node, step: s.step, steps: n.steps });
    if (n.enemies.length && Math.random() < (n.encounterRate ?? 0.6)) {
      this.spawn(pick(n.enemies), false);
    } else if (Math.random() < 0.35) {
      this.log(pick(FLAVOR), 'info');
    }
  }

  private spawn(id: string, boss: boolean): void {
    const def = ENEMIES[id];
    const k = this.scale;
    const hp = Math.round(def.hp * k);
    const foe: Foe = {
      id,
      name: def.name,
      hp,
      maxHp: hp,
      atk: Math.round(def.atk * k),
      def: Math.round(def.def * k),
      xp: Math.round(def.xp * k),
      gold: Math.round(def.gold * this.goldScale * rand(0.7, 1.3)),
      boss,
    };
    this.s.foe = foe;
    this.s.phase = 'combat';
    this.log(boss ? `${foe.name} blocks your way!` : `A ${foe.name} appears!`, boss ? 'bad' : 'combat');
    this.events.emit('foeAppear', { foe });
  }

  private combat(): void {
    const s = this.s;
    const h = s.hero;
    const foe = s.foe;
    if (!foe) {
      s.phase = 'travel';
      return;
    }

    if (h.hp < h.maxHp * 0.35 && h.potions > 0) {
      h.potions--;
      const healed = Math.min(h.maxHp - h.hp, Math.ceil(h.maxHp * 0.5));
      h.hp += healed;
      this.log(`You drink a potion. (+${healed} HP)`, 'loot');
      this.events.emit('potion', { healed });
      return;
    }

    const crit = Math.random() < 0.1;
    const dealt = damage(h.atk, foe.def) * (crit ? 2 : 1);
    foe.hp = Math.max(0, foe.hp - dealt);
    this.events.emit('heroHit', { damage: dealt, crit, foe });

    if (foe.hp <= 0) {
      this.log(`${crit ? 'Critical! ' : ''}You strike the ${foe.name} for ${dealt}. It falls.`, 'combat');
      this.win(foe);
      return;
    }

    const taken = damage(foe.atk, h.def);
    h.hp = Math.max(0, h.hp - taken);
    this.log(`${crit ? 'Critical! ' : ''}You hit for ${dealt}. The ${foe.name} hits back for ${taken}.`, 'combat');
    this.events.emit('heroHurt', { damage: taken, hp: h.hp, maxHp: h.maxHp });

    if (h.hp <= 0) this.lose();
  }

  private win(foe: Foe): void {
    const s = this.s;
    const h = s.hero;
    s.foe = null;
    s.stats.kills++;
    if (foe.boss) s.bossDone = true;
    this.events.emit('foeDefeated', { foe });

    const potion = Math.random() < (foe.boss ? 1 : 0.06);
    h.gold += foe.gold;
    if (potion) h.potions++;
    this.log(`+${foe.xp} XP, +${foe.gold} gold${potion ? ', and a potion' : ''}.`, 'loot');
    this.events.emit('loot', { gold: foe.gold, potion });
    this.gainXp(foe.xp);

    if (h.hp < h.maxHp * 0.4) {
      s.phase = 'rest';
      this.log('You make camp to tend your wounds.', 'info');
      this.events.emit('restStart', {});
    } else {
      s.phase = 'travel';
    }
  }

  private lose(): void {
    const s = this.s;
    const goldLost = Math.floor(s.hero.gold * 0.25);
    s.hero.gold -= goldLost;
    s.stats.deaths++;
    s.phase = 'defeat';
    s.wait = DEFEAT_TICKS;
    this.log(
      `You fall to the ${s.foe?.name ?? 'enemy'}.${goldLost ? ` ${goldLost} gold slips from your purse.` : ''}`,
      'bad',
    );
    this.events.emit('defeat', { goldLost });
  }

  private defeated(): void {
    const s = this.s;
    if (--s.wait > 0) return;
    s.hero.hp = s.hero.maxHp;
    s.foe = null;
    this.log(`You wake at ${STORY[s.checkpoint].title}, bruised but alive.`, 'story');
    this.events.emit('respawn', { node: s.checkpoint });
    this.arrive(s.checkpoint, true);
  }

  private rest(): void {
    const h = this.s.hero;
    h.hp = Math.min(h.maxHp, h.hp + Math.ceil(h.maxHp * 0.12));
    if (h.hp >= h.maxHp) {
      this.s.phase = 'travel';
      this.log('Rested, you shoulder your pack.', 'info');
      this.events.emit('restEnd', {});
    }
  }

  // ---------- story ----------

  private showChoice(): void {
    this.s.phase = 'choice';
    this.s.wait = 0;
    this.log(this.node.prompt, 'story');
    this.events.emit('choiceShown', { node: this.s.node });
  }

  private waitForChoice(): void {
    if (!this.s.autoChoose) return;
    if (++this.s.wait < AUTO_CHOOSE_TICKS) return;
    const options = this.node.choices.map((_, i) => i).filter((i) => this.canChoose(this.node.choices[i]));
    this.choose(pick(options));
  }

  canChoose(choice: Choice): boolean {
    return meets(this.s, choice.requires);
  }

  choose(index: number): void {
    const s = this.s;
    const choice = this.node.choices[index];
    if (s.phase !== 'choice' || !choice || !this.canChoose(choice)) return;
    s.stats.choices++;
    this.log(`> ${choice.label}`, 'info');
    if (choice.result) this.log(choice.result, 'story');
    this.events.emit('choiceMade', { node: s.node, label: choice.label });
    if (choice.effects) this.apply(choice.effects);
    this.arrive(choice.next);
  }

  private apply(e: Effect): void {
    const s = this.s;
    const h = s.hero;
    const k = this.scale;
    if (e.gold) h.gold = Math.max(0, h.gold + (e.gold > 0 ? Math.round(e.gold * this.goldScale) : e.gold));
    if (e.potions) h.potions = Math.max(0, h.potions + e.potions);
    if (e.atk) h.atk += e.atk;
    if (e.def) h.def += e.def;
    if (e.maxHp) {
      h.maxHp += e.maxHp;
      h.hp += e.maxHp;
    }
    if (e.hpPct) h.hp = Math.min(h.maxHp, Math.max(1, h.hp + Math.round((h.maxHp * e.hpPct) / 100)));
    if (e.flag && !s.flags.includes(e.flag)) s.flags.push(e.flag);
    if (e.unflag) s.flags = s.flags.filter((f) => f !== e.unflag);
    if (e.xp) this.gainXp(Math.round(e.xp * k));
    if (e.newJourney) {
      s.journey++;
      s.stats.journeys++;
      s.flags = [];
      this.log(`Journey ${s.journey + 1} begins. The monsters have grown stronger.`, 'level');
      this.events.emit('journeyComplete', { journey: s.journey });
    }
  }

  private arrive(id: string, silent = false): void {
    const s = this.s;
    s.node = id;
    s.step = 0;
    s.bossDone = false;
    s.phase = 'travel';
    const n = STORY[id];
    if (n.checkpoint) s.checkpoint = id;
    if (!silent) this.log(n.text, 'story');
    this.events.emit('arrive', { node: id, title: n.title });
  }

  private gainXp(amount: number): void {
    const h = this.s.hero;
    h.xp += amount;
    while (h.xp >= xpToNext(h.level)) {
      h.xp -= xpToNext(h.level);
      h.level++;
      h.maxHp += 8;
      h.atk += 2;
      h.def += 1;
      h.hp = h.maxHp;
      this.log(`Level up! You are now level ${h.level}.`, 'level');
      this.events.emit('levelUp', { level: h.level });
    }
  }

  // ---------- shop ----------

  cost(key: ShopKey): number {
    const item = SHOP[key];
    if (key === 'potion') return Math.round(item.base * this.goldScale);
    return Math.round(item.base * Math.pow(item.growth, this.s.bought[key]));
  }

  buy(key: ShopKey): boolean {
    const h = this.s.hero;
    const cost = this.cost(key);
    if (h.gold < cost) return false;
    h.gold -= cost;
    this.s.bought[key]++;
    if (key === 'atk') h.atk += 2;
    if (key === 'def') h.def += 1;
    if (key === 'hp') {
      h.maxHp += 10;
      h.hp += 10;
    }
    if (key === 'potion') h.potions++;
    this.events.emit('purchase', { item: key, cost });
    return true;
  }

  // ---------- offline progress ----------

  /** Silently simulate time spent away. Stops at a choice unless auto-choose is on. */
  catchUp(ms: number): CatchUpSummary {
    const ticks = Math.min(MAX_OFFLINE_TICKS, Math.floor(ms / TICK_MS));
    const h = this.s.hero;
    const before = { gold: h.gold, level: h.level, kills: this.s.stats.kills, deaths: this.s.stats.deaths };
    let totalXp = 0;
    let ran = 0;
    this.events.muted = true;
    let lastXp = h.xp;
    let lastLevel = h.level;
    for (; ran < ticks; ran++) {
      if (this.s.phase === 'choice' && !this.s.autoChoose) break;
      this.tick();
      // Track XP across level-ups.
      for (let l = lastLevel; l < h.level; l++) totalXp += xpToNext(l);
      totalXp += h.xp - lastXp;
      lastXp = h.xp;
      lastLevel = h.level;
    }
    this.events.muted = false;
    return {
      ticks: ran,
      gold: h.gold - before.gold,
      xp: totalXp,
      levels: h.level - before.level,
      kills: this.s.stats.kills - before.kills,
      deaths: this.s.stats.deaths - before.deaths,
      stoppedAtChoice: this.s.phase === 'choice',
    };
  }

  // ---------- misc ----------

  log(text: string, kind: LogKind): void {
    const s = this.s;
    s.log.push({ id: ++s.logSeq, text, kind });
    if (s.log.length > LOG_LIMIT) s.log.splice(0, s.log.length - LOG_LIMIT);
  }
}

export function meets(s: State, r?: Req): boolean {
  if (!r) return true;
  const h = s.hero;
  if (r.gold !== undefined && h.gold < r.gold) return false;
  if (r.potions !== undefined && h.potions < r.potions) return false;
  if (r.level !== undefined && h.level < r.level) return false;
  if (r.flag && !s.flags.includes(r.flag)) return false;
  if (r.notFlag && s.flags.includes(r.notFlag)) return false;
  return true;
}

export function describeReq(r?: Req): string {
  if (!r) return '';
  const parts: string[] = [];
  if (r.gold !== undefined) parts.push(`${r.gold} gold`);
  if (r.potions !== undefined) parts.push(`${r.potions} potion${r.potions > 1 ? 's' : ''}`);
  if (r.level !== undefined) parts.push(`level ${r.level}`);
  if (r.flag) parts.push('a past deed');
  if (r.notFlag) parts.push('a clean conscience');
  return parts.join(', ');
}
