import type {
  GameConfig,
  GameState,
  FeatureState,
  GridResult,
  SpinResult,
  RoundResult,
  EvalResult,
} from '@/types';
import type { IRng } from './rng';
import { EventLog } from './eventLog';
import { spinReels, gridFromStops } from './reel';
import { evaluate } from './pay';
import { evalTriggers, type TriggerContext } from './trigger';
import { createFeature } from '@/features/registry';
import type { FeatureRunContext } from '@/features/types';

/** Options controlling a single round (also the cheat / buy injection surface). */
export interface PlayOptions {
  bet: number;
  /** Force these trigger ids to fire regardless of the board. */
  forcedTriggers?: string[];
  /** Force base-spin reel stops (reelstrip mode). */
  forcedStops?: number[];
  /** Cheat: scale the round win to an arbitrary max-win multiple of bet. */
  forceMaxWinX?: number;
  /** Safety cap on cascades per spin. */
  cascadeCap?: number;
}

const SAFE_CASCADE_CAP = 50;
const SAFE_FEATURE_SPIN_CAP = 5000;

/**
 * GameEngine — the deterministic heart of the simulator. UI-free and
 * animation-free; both the live client and the high-speed simulation drive it.
 * Given the same RNG seed and config, playRound() is fully reproducible.
 */
export class GameEngine {
  config: GameConfig;
  rng: IRng;
  log: EventLog;

  state: GameState = 'IDLE';
  featureState: FeatureState = 'INACTIVE';
  lastReelStops: number[] = [];
  activeFeature: string | null = null;

  private bet = 0;
  private forcedStops: number[] | undefined;

  constructor(config: GameConfig, rng: IRng, log: EventLog) {
    this.config = config;
    this.rng = rng;
    this.log = log;
  }

  private setState(s: GameState): void {
    this.state = s;
    this.log.emit('STATE_CHANGE', { state: s });
  }

  /* ------------------------------- Round -------------------------------- */

  playRound(opts: PlayOptions): RoundResult {
    this.bet = opts.bet;
    this.forcedStops = opts.forcedStops;
    this.log.roundId++;
    this.log.spinId = 0;
    this.log.cascadeId = 0;

    this.setState('ROUND_START');
    this.log.emit('ROUND_START', { bet: opts.bet, seed: this.rng.seed });

    const spins: SpinResult[] = [];
    const triggeredFeatures: string[] = [];

    // --- base spin ---
    const base = this.runSpin('normal');
    spins.push(base);
    this.forcedStops = undefined; // forced stops only apply to the base spin

    // --- trigger evaluation on the base spin's final grid ---
    const finalGrid = lastGrid(base);
    const ctx = this.buildTriggerContext(finalGrid, base.spinWin);
    const fired = evalTriggers(this.config.triggers, ctx);

    const firedIds = new Set(fired.map((t) => t.id));
    for (const forced of opts.forcedTriggers ?? []) firedIds.add(forced);
    base.firedTriggers = [...firedIds];

    // --- run features for fired triggers ---
    this.setState('FEATURE_TRIGGER');
    for (const triggerId of firedIds) {
      const trigger = this.config.triggers.find((t) => t.id === triggerId);
      // forced ids may name either a trigger id or directly a feature id
      const featureEntryId = trigger?.target ?? triggerId;
      const entry = this.config.features.find(
        (f) => f.id === featureEntryId && f.enabled,
      );
      if (!entry) continue;

      const plugin = createFeature(entry.type);
      if (!plugin) continue;

      this.emitTriggerEvent(entry.type);
      this.setState('FEATURE_RUNNING');
      this.activeFeature = entry.id;

      const fctx: FeatureRunContext = {
        config: this.config,
        rng: this.rng,
        bet: this.bet,
        runSpin: (kind: string) => {
          if (spins.length > SAFE_FEATURE_SPIN_CAP) {
            // runaway guard
            return this.makeEmptySpin(kind);
          }
          const s = this.runSpin(kind);
          spins.push(s);
          return s;
        },
        emit: (type, payload) => this.log.emit(type, payload),
      };

      const result = plugin.run(entry, fctx);
      this.featureState = plugin.state;
      triggeredFeatures.push(entry.id);
      void result;
      this.activeFeature = null;
    }

    // --- settle round ---
    let totalWin = spins.reduce((a, s) => a + s.spinWin, 0);

    if (opts.forceMaxWinX && opts.forceMaxWinX > 0) {
      totalWin = opts.forceMaxWinX * this.bet;
      this.log.emit('CHEAT', { type: 'FORCE_MAX_WIN', x: opts.forceMaxWinX });
    }

    this.setState('ROUND_END');
    this.log.emit('ROUND_END', {
      totalWin,
      roundReturn: this.bet > 0 ? totalWin / this.bet : 0,
      spins: spins.length,
    });
    this.setState('IDLE');

    return {
      roundId: this.log.roundId,
      bet: this.bet,
      spins,
      totalWin,
      roundReturn: this.bet > 0 ? totalWin / this.bet : 0,
      triggeredFeatures,
    };
  }

  /* -------------------------------- Spin -------------------------------- */

  private runSpin(kind: string): SpinResult {
    this.log.spinId++;
    this.log.cascadeId = 0;

    this.setState('SPIN_START');
    this.log.emit('SPIN_START', { kind });

    this.setState('SPINNING');

    const outcome =
      this.forcedStops && kind === 'normal'
        ? gridFromStops(this.config, this.forcedStops)
        : spinReels(this.config, this.rng);

    this.lastReelStops = outcome.reelStops;
    this.setState('SPIN_STOP');
    this.log.emit('REEL_STOP', { kind, stops: outcome.reelStops });

    let grid = outcome.grid;
    const cascades: EvalResult[] = [];
    const gridSteps: GridResult[] = [];
    let spinWinUnits = 0;
    const cap = SAFE_CASCADE_CAP;
    const cascading = this.config.animation.type === 'cascading';

    for (let step = 0; step <= cap; step++) {
      this.setState('EVALUATE');
      gridSteps.push(grid);
      const res = evaluate(this.config, grid);
      cascades.push(res);
      spinWinUnits += res.totalPay;

      if (res.totalPay > 0) {
        this.log.emit('WIN', {
          kind,
          step,
          pay: res.totalPay,
          wins: res.wins,
        });
      }

      this.setState('CASCADE_CHECK');
      if (cascading && res.wins.length > 0 && step < cap) {
        this.log.cascadeId++;
        this.setState('CASCADE_RUNNING');
        this.log.emit('CASCADE', { kind, step: this.log.cascadeId });
        grid = this.cascadeRefill(grid, res);
      } else {
        break;
      }
    }

    const spinWin = spinWinUnits * this.bet;

    return {
      spinId: this.log.spinId,
      kind,
      reelStops: outcome.reelStops,
      grid: outcome.grid,
      gridSteps,
      cascades,
      spinWin,
      firedTriggers: [],
    };
  }

  /* ------------------------------ Cascade ------------------------------- */

  /** Remove winning cells, collapse columns downward, refill from the top. */
  private cascadeRefill(grid: GridResult, res: EvalResult): GridResult {
    const remove = new Set<string>();
    for (const w of res.wins) {
      for (const c of w.cells) remove.add(`${c.col}:${c.row}`);
    }

    const symbols = this.config.symbols;
    const weights = symbols.map((s) => Math.max(0, s.weight));
    const ids = symbols.map((s) => s.id);

    const columns = grid.columns.map((column, col) => {
      const survivors: string[] = [];
      for (let row = 0; row < column.length; row++) {
        if (!remove.has(`${col}:${row}`)) survivors.push(column[row]);
      }
      // refill the top with fresh weighted symbols
      while (survivors.length < column.length) {
        survivors.push(ids[this.rng.weightedIndex(weights)]);
      }
      return survivors;
    });

    return { cols: grid.cols, shape: [...grid.shape], columns };
  }

  /* ------------------------------ Helpers ------------------------------- */

  private buildTriggerContext(grid: GridResult, spinWin: number): TriggerContext {
    const symbolCounts: Record<string, number> = {};
    for (const column of grid.columns) {
      for (const id of column) symbolCounts[id] = (symbolCounts[id] ?? 0) + 1;
    }
    // a few generic metrics features/triggers can reference
    const metrics: Record<string, number> = {
      win: spinWin,
      winX: this.bet > 0 ? spinWin / this.bet : 0,
    };
    return { symbolCounts, metrics };
  }

  private emitTriggerEvent(featureType: string): void {
    if (featureType === 'freeGame') this.log.emit('FG_TRIGGER', { featureType });
    else if (featureType === 'holdAndSpin')
      this.log.emit('BONUS_TRIGGER', { featureType });
    else this.log.emit('FEATURE_START', { featureType });
  }

  private makeEmptySpin(kind: string): SpinResult {
    const shape = this.config.grid.shape;
    return {
      spinId: this.log.spinId,
      kind,
      reelStops: [],
      grid: {
        cols: shape.length,
        shape: [...shape],
        columns: shape.map((r) => Array.from({ length: r }, () => '')),
      },
      gridSteps: [],
      cascades: [],
      spinWin: 0,
      firedTriggers: [],
    };
  }
}

/** Final grid of a spin (after the last cascade). */
function lastGrid(spin: SpinResult): GridResult {
  return spin.grid;
}
