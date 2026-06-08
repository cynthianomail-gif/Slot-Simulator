import type { GameConfig } from '@/types';
import type { PlayOptions } from './gameEngine';

/** Developer cheat surface. Each cheat maps to a PlayOptions mutation. */
export type CheatKind =
  | 'FORCE_FG'
  | 'FORCE_BG'
  | 'FORCE_BONUS'
  | 'FORCE_RESPIN'
  | 'FORCE_SCATTER'
  | 'FORCE_MAX_WIN';

export interface CheatState {
  /** Cheats armed for the *next* round, consumed once. */
  armed: CheatKind[];
  maxWinX: number;
}

/**
 * Resolve armed cheats into PlayOptions. Force-* cheats resolve to feature /
 * trigger ids by matching the config's triggers/features by intent.
 */
export function applyCheats(
  config: GameConfig,
  base: PlayOptions,
  cheats: CheatState,
): PlayOptions {
  if (cheats.armed.length === 0) return base;
  const forced = new Set(base.forcedTriggers ?? []);
  let forceMaxWinX = base.forceMaxWinX;

  for (const c of cheats.armed) {
    switch (c) {
      case 'FORCE_FG':
        addFeatureOfType(config, ['freeGame'], forced);
        break;
      case 'FORCE_BG':
      case 'FORCE_BONUS':
        addFeatureOfType(config, ['holdAndSpin', 'bonus'], forced);
        break;
      case 'FORCE_RESPIN':
        addFeatureOfType(config, ['respin'], forced);
        break;
      case 'FORCE_SCATTER':
        // Force the first free-game trigger directly (board-independent).
        addFirstTrigger(config, forced);
        break;
      case 'FORCE_MAX_WIN':
        forceMaxWinX = cheats.maxWinX || 5000;
        break;
    }
  }

  return {
    ...base,
    forcedTriggers: [...forced],
    forceMaxWinX,
  };
}

function addFeatureOfType(
  config: GameConfig,
  types: string[],
  out: Set<string>,
): void {
  const entry = config.features.find((f) => f.enabled && types.includes(f.type));
  if (entry) out.add(entry.id);
}

function addFirstTrigger(config: GameConfig, out: Set<string>): void {
  const t = config.triggers[0];
  if (t) out.add(t.id);
}
