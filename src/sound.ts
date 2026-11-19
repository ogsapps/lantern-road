import type { Game } from './game';

/**
 * Hook your sound engine in here. The game emits an event for every moment
 * worth a sound; nothing fires during offline catch-up.
 *
 * Available events (payloads are typed, see GameEvents in game.ts):
 *   arrive, step, foeAppear, heroHit, heroHurt, foeDefeated, loot, potion,
 *   levelUp, restStart, restEnd, choiceShown, choiceMade, defeat, respawn,
 *   purchase, journeyComplete
 */
export function connectSound(game: Game): void {
  void game;
  // Examples:
  // game.events.on('heroHit', ({ crit }) => engine.play(crit ? 'crit' : 'hit'));
  // game.events.on('heroHurt', () => engine.play('hurt'));
  // game.events.on('foeAppear', ({ foe }) => engine.play(foe.boss ? 'boss' : 'encounter'));
  // game.events.on('levelUp', () => engine.play('levelup'));
  // game.events.on('arrive', ({ node }) => engine.music(node));
}
