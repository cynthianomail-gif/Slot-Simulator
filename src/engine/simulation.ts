import type { GameConfig } from '@/types';
import { GameEngine } from './gameEngine';
import { EventLog } from './eventLog';
import { StatisticsEngine, type StatsSnapshot } from './statistics';
import { createRng } from './rng';

export interface SimulationOptions {
  rounds: number;
  bet: number;
  seed?: number | null;
  /** progress callback (every `chunk` rounds). */
  onProgress?: (done: number, total: number, partial: StatsSnapshot) => void;
  chunk?: number;
}

export interface SimulationReport extends StatsSnapshot {
  rounds: number;
  bet: number;
  seed: number | null;
  elapsedMs: number;
  roundsPerSec: number;
}

/**
 * High-speed math simulation. Runs entirely headless:
 *   - event log disabled (no allocation)
 *   - no animation, no React updates
 *   - pure engine math
 *
 * Yields to the event loop every `chunk` rounds so the UI can paint progress
 * and stay responsive during 100K runs.
 */
export async function runSimulation(
  config: GameConfig,
  opts: SimulationOptions,
): Promise<SimulationReport> {
  const log = new EventLog(1);
  log.enabled = false; // critical for throughput
  const rng = createRng(opts.seed ?? null);
  const engine = new GameEngine(config, rng, log);
  const stats = new StatisticsEngine();

  const chunk = opts.chunk ?? 2000;
  const start = performance.now();

  for (let i = 0; i < opts.rounds; i++) {
    const round = engine.playRound({ bet: opts.bet });
    stats.record(round);

    if ((i + 1) % chunk === 0) {
      opts.onProgress?.(i + 1, opts.rounds, stats.snapshot());
      // yield so the browser can repaint / remain interactive
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  const elapsedMs = performance.now() - start;
  const snap = stats.snapshot();
  opts.onProgress?.(opts.rounds, opts.rounds, snap);

  return {
    ...snap,
    rounds: opts.rounds,
    bet: opts.bet,
    seed: rng.seed,
    elapsedMs,
    roundsPerSec: elapsedMs > 0 ? (opts.rounds / elapsedMs) * 1000 : 0,
  };
}
