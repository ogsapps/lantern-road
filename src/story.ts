// All game content lives here. Add enemies and story nodes freely;
// the engine only needs START_NODE to exist and every `next` to point at a real node.

export interface EnemyDef {
  name: string;
  hp: number;
  atk: number;
  def: number;
  xp: number;
  gold: number;
}

export const ENEMIES: Record<string, EnemyDef> = {
  rat:      { name: 'Giant Rat',    hp: 8,   atk: 3,  def: 0,  xp: 3,   gold: 2 },
  slime:    { name: 'Moss Slime',   hp: 12,  atk: 3,  def: 1,  xp: 4,   gold: 3 },
  wolf:     { name: 'Grey Wolf',    hp: 18,  atk: 6,  def: 1,  xp: 7,   gold: 4 },
  boar:     { name: 'Tusked Boar',  hp: 24,  atk: 5,  def: 3,  xp: 8,   gold: 5 },
  bandit:   { name: 'Road Bandit',  hp: 20,  atk: 7,  def: 2,  xp: 9,   gold: 12 },
  lizard:   { name: 'River Lizard', hp: 22,  atk: 6,  def: 3,  xp: 8,   gold: 6 },
  ghoul:    { name: 'Ghoul',        hp: 30,  atk: 8,  def: 3,  xp: 12,  gold: 8 },
  hag:      { name: 'Bog Hag',      hp: 36,  atk: 10, def: 4,  xp: 16,  gold: 12 },
  skeleton: { name: 'Skeleton',     hp: 32,  atk: 9,  def: 5,  xp: 14,  gold: 9 },
  cultist:  { name: 'Ash Cultist',  hp: 28,  atk: 11, def: 3,  xp: 15,  gold: 15 },
  wraith:   { name: 'Wraith',       hp: 40,  atk: 13, def: 5,  xp: 20,  gold: 14 },
  harpy:    { name: 'Harpy',        hp: 38,  atk: 14, def: 4,  xp: 22,  gold: 14 },
  ogre:     { name: 'Mountain Ogre', hp: 70, atk: 16, def: 7,  xp: 35,  gold: 25 },
  warden:   { name: 'The Stone Warden', hp: 240, atk: 22, def: 12, xp: 120, gold: 100 },
};

/** Conditions a choice needs before it can be picked. */
export interface Req {
  gold?: number;
  potions?: number;
  level?: number;
  flag?: string;
  notFlag?: string;
}

/** What happens when a choice is picked. All fields optional and combinable. */
export interface Effect {
  gold?: number;
  xp?: number;
  potions?: number;
  /** Heal (positive) or hurt (negative) by a percentage of max HP. Never kills. */
  hpPct?: number;
  atk?: number;
  def?: number;
  maxHp?: number;
  flag?: string;
  unflag?: string;
  /** Finish the journey: clears flags, raises difficulty, rewards scale up. */
  newJourney?: boolean;
}

export interface Choice {
  label: string;
  requires?: Req;
  effects?: Effect;
  /** Text logged after picking. */
  result?: string;
  next: string;
}

export interface StoryNode {
  title: string;
  /** Logged on arrival. */
  text: string;
  /** Number of travel steps before the choice. */
  steps: number;
  enemies: string[];
  encounterRate?: number;
  /** Enemy fought once at the end of the stretch, before the choice. */
  boss?: string;
  /** Respawn here after defeat. */
  checkpoint?: boolean;
  /** Shown above the choices. */
  prompt: string;
  /** Keep at least one choice without `requires` so the player is never stuck. */
  choices: Choice[];
}

export const START_NODE = 'village';

export const STORY: Record<string, StoryNode> = {
  village: {
    title: 'Thornwick',
    text: 'You leave Thornwick at dawn with a lantern, a dull sword, and a promise to light the old beacon.',
    steps: 10,
    enemies: ['rat', 'slime'],
    checkpoint: true,
    prompt: 'The road forks at a crooked milestone.',
    choices: [
      { label: 'Take the forest path', next: 'forest' },
      { label: 'Follow the river', next: 'river' },
    ],
  },

  forest: {
    title: 'Hollowpine Forest',
    text: 'Pines close overhead. Something keeps pace with you just beyond the lantern light.',
    steps: 14,
    enemies: ['wolf', 'boar', 'bandit'],
    prompt: 'A wounded traveler lies against a fallen oak, clutching her side.',
    choices: [
      {
        label: 'Give her a potion',
        requires: { potions: 1 },
        effects: { potions: -1, def: 1, flag: 'kind' },
        result: 'She presses a silver charm into your hand. (+1 DEF)',
        next: 'shrine',
      },
      {
        label: 'Rifle through her pack',
        effects: { gold: 25, flag: 'thief' },
        result: 'You take 25 gold. She does not look at you as you leave.',
        next: 'shrine',
      },
      { label: 'Walk on', result: 'You leave her to the forest.', next: 'shrine' },
    ],
  },

  river: {
    title: 'The Blackwater',
    text: 'The river runs dark and fast. Lizards sun themselves on the banks and watch you pass.',
    steps: 14,
    enemies: ['lizard', 'bandit', 'slime'],
    prompt: 'A hooded ferryman waits at a rotting jetty.',
    choices: [
      {
        label: 'Pay 20 gold for passage',
        requires: { gold: 20 },
        effects: { gold: -20 },
        result: 'The ferry glides across in silence and lets you off near old ruins.',
        next: 'ruins',
      },
      {
        label: 'Swim across',
        effects: { hpPct: -30, xp: 15 },
        result: 'The current batters you against the rocks, but you make it. (-30% HP)',
        next: 'ruins',
      },
      { label: 'Wade upstream to the ford', result: 'The ford leads into fog and reeds.', next: 'marsh' },
    ],
  },

  shrine: {
    title: 'The Mossy Shrine',
    text: 'The trees part around a shrine older than any kingdom. The air hums.',
    steps: 10,
    enemies: ['wolf', 'ghoul'],
    checkpoint: true,
    prompt: 'The shrine waits for an offering.',
    choices: [
      {
        label: 'Pray with the silver charm',
        requires: { flag: 'kind' },
        effects: { maxHp: 20, hpPct: 100 },
        result: 'The charm glows warm against your chest. (+20 Max HP)',
        next: 'pass',
      },
      {
        label: 'Offer 30 gold',
        requires: { gold: 30 },
        effects: { gold: -30, atk: 3 },
        result: 'Your blade feels lighter in your hand. (+3 ATK)',
        next: 'pass',
      },
      {
        label: 'Pry the gems from the altar',
        effects: { gold: 60, flag: 'cursed' },
        result: 'Sixty gold of gemstones. The humming stops.',
        next: 'pass',
      },
      { label: 'Move on', next: 'pass' },
    ],
  },

  ruins: {
    title: 'Ruins of Calder',
    text: 'Broken towers lean against each other like tired old men.',
    steps: 12,
    enemies: ['skeleton', 'cultist', 'ghoul'],
    checkpoint: true,
    prompt: 'Collapsed stairs lead down into a crypt. A goat track climbs toward the mountain pass.',
    choices: [
      { label: 'Descend into the crypt', next: 'crypt' },
      { label: 'Climb toward the pass', next: 'pass' },
    ],
  },

  marsh: {
    title: 'Weeping Marsh',
    text: 'Fog, reeds, and the smell of rot. Your boots never quite find the bottom.',
    steps: 14,
    enemies: ['hag', 'slime', 'lizard'],
    prompt: 'Pale lights dance over the water, beckoning.',
    choices: [
      {
        label: 'Follow the lights',
        effects: { hpPct: -15 },
        result: 'The lights drag you underground and drop you into a crypt. (-15% HP)',
        next: 'crypt',
      },
      { label: 'Ignore them and push on', result: 'You find solid ground rising toward the mountains.', next: 'pass' },
    ],
  },

  crypt: {
    title: 'The Calder Crypt',
    text: 'Bones crunch underfoot. Your lantern is the first light down here in centuries.',
    steps: 18,
    enemies: ['skeleton', 'wraith', 'cultist'],
    prompt: 'A sarcophagus sealed with iron chains sits at the heart of the crypt.',
    choices: [
      {
        label: 'Return the stolen gems',
        requires: { flag: 'cursed' },
        effects: { unflag: 'cursed', xp: 100, def: 2 },
        result: 'You lay the gems on the lid. Something old forgives you. (+2 DEF)',
        next: 'pass',
      },
      {
        label: 'Break the chains',
        effects: { gold: 120, potions: 2, hpPct: -20 },
        result: 'The lid explodes outward. When the dust clears you have 120 gold and 2 potions. (-20% HP)',
        next: 'pass',
      },
      { label: 'Leave it be', result: 'Some things should stay buried.', next: 'pass' },
    ],
  },

  pass: {
    title: 'Frostfang Pass',
    text: 'Wind screams through the pass. Far above, the dark shape of the beacon tower.',
    steps: 18,
    enemies: ['harpy', 'ogre', 'wraith'],
    checkpoint: true,
    prompt: 'A stone giant stands before the tower gate. Its eyes grind open.',
    choices: [{ label: 'Climb to the summit', next: 'summit' }],
  },

  summit: {
    title: 'The Beacon',
    text: 'The Stone Warden rises from the rubble to block the stairs.',
    steps: 5,
    enemies: ['harpy'],
    boss: 'warden',
    prompt: 'The great brazier stands cold, as it has for a hundred years.',
    choices: [
      {
        label: 'Light the beacon',
        effects: { newJourney: true, gold: 100, xp: 100 },
        result: 'Fire roars into the sky. Across the valley, distant beacons answer. But the road home is darker than before...',
        next: 'village',
      },
      {
        label: "Steal the brazier's gold instead",
        requires: { flag: 'thief' },
        effects: { newJourney: true, gold: 300 },
        result: 'You leave the beacon cold and your pockets heavy. The valley will stay dark.',
        next: 'village',
      },
    ],
  },
};
