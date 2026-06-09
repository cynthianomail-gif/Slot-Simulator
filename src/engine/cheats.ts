import type { GameConfig } from '@/types';
import type { PlayOptions } from './gameEngine';

/**
 * Force-open ("強開") surface. The user arms one or more of their own triggers
 * (defined in the 機制 tab); the next spin then both forces those triggers to
 * fire AND seeds the base grid with the symbols their condition needs, so the
 * board visibly spins out the triggering result.
 */
export interface CheatState {
  /** Trigger ids armed for the next round (consumed once). */
  armedTriggers: string[];
  /** Force the round to pay an exact max-win multiple of bet. */
  forceMaxWin: boolean;
  maxWinX: number;
}

export function applyCheats(
  config: GameConfig,
  base: PlayOptions,
  cheats: CheatState,
): PlayOptions {
  if (cheats.armedTriggers.length === 0 && !cheats.forceMaxWin) return base;

  const forced = new Set(base.forcedTriggers ?? []);
  const forceSymbols: { id: string; count: number }[] = [...(base.forceSymbols ?? [])];

  for (const tid of cheats.armedTriggers) {
    forced.add(tid);
    // pull the trigger's primary symbol condition so the board shows it
    const trig = config.triggers.find((t) => t.id === tid);
    const cond = trig?.rule.conditions?.find((c) => c.symbolId);
    if (cond?.symbolId && ['>=', '>', '='].includes(cond.comparator)) {
      const count = cond.comparator === '>' ? cond.value + 1 : cond.value;
      forceSymbols.push({ id: cond.symbolId, count: Math.max(1, Math.floor(count)) });
    }
  }

  return {
    ...base,
    forcedTriggers: [...forced],
    forceSymbols: forceSymbols.length ? forceSymbols : base.forceSymbols,
    forceMaxWinX: cheats.forceMaxWin ? cheats.maxWinX || 5000 : base.forceMaxWinX,
  };
}
