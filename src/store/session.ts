import type { GameConfig } from '@/types';
import { GameEngine } from '@/engine/gameEngine';
import { EventLog } from '@/engine/eventLog';
import { StatisticsEngine } from '@/engine/statistics';
import { createRng } from '@/engine/rng';

/**
 * Non-reactive engine session. Holds the live GameEngine, EventLog and
 * StatisticsEngine instances so the Zustand store can stay a thin, serialisable
 * view layer. Recreated whenever the config or RNG seed changes.
 */
export interface Session {
  engine: GameEngine;
  log: EventLog;
  stats: StatisticsEngine;
}

export function createSession(
  config: GameConfig,
  seed: number | null,
): Session {
  const log = new EventLog(5000);
  const rng = createRng(seed);
  const engine = new GameEngine(config, rng, log);
  const stats = new StatisticsEngine();
  return { engine, log, stats };
}
