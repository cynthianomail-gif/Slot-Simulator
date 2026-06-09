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
import { spinReels, gridFromStops, reelSymbolWeights } from './reel';
import { evaluate } from './pay';
import { evalTriggers, type TriggerContext } from './trigger';
import { createFeature } from '@/features/registry';
import type { FeatureRunContext } from '@/features/types';

/** Options controlling a single round (also the cheat / buy injection surface). */
export interface PlayOptions {
  bet: number;
  /** Force these trigger ids to fire regardless of the board. */
  forcedTriggers?: string[];
  /** Force the base spin's grid to contain at least `count` of a symbol id. */
  forceSymbols?: { id: string; count: number }[];
  /** Force base-spin reel stops (reelstrip mode). */
  forcedStops?: number[];
  /** Cheat: scale the round win to an arbitrary max-win multiple of bet. */
  forceMaxWinX?: number;
  /** Safety cap on cascades per spin. */
  cascadeCap?: number;
}

/** Force at least `count` of each requested symbol onto the grid (cheat aid). */
function injectSymbols(
  grid: GridResult,
  specs: { id: string; count: number }[],
  rng: IRng,
): void {
  for (const spec of specs) {
    const cells: [number, number][] = [];
    for (let c = 0; c < grid.columns.length; c++) {
      for (let r = 0; r < grid.columns[c].length; r++) cells.push([c, r]);
    }
    let have = cells.filter(([c, r]) => grid.columns[c][r] === spec.id).length;
    // shuffle so the forced symbols land in varied spots
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }
    for (const [c, r] of cells) {
      if (have >= spec.count) break;
      if (grid.columns[c][r] !== spec.id) {
        grid.columns[c][r] = spec.id;
        have++;
      }
    }
  }
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
  private forceSymbols: { id: string; count: number }[] | undefined;

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
    this.forceSymbols = opts.forceSymbols;
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
    this.forceSymbols = undefined; // forced symbols only apply to the base spin

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

    const useFg = kind === 'freegame' || kind === 'free';
    const outcome =
      this.forcedStops && kind === 'normal'
        ? gridFromStops(this.config, this.forcedStops)
        : spinReels(this.config, this.rng, useFg);

    this.lastReelStops = outcome.reelStops;
    this.setState('SPIN_STOP');
    this.log.emit('REEL_STOP', { kind, stops: outcome.reelStops });

    let grid = outcome.grid;
    if (kind === 'normal' && this.forceSymbols?.length) {
      injectSymbols(grid, this.forceSymbols, this.rng);
    }
    const cascades: EvalResult[] = [];
    const gridSteps: GridResult[] = [];
    let spinWinUnits = 0;
    const cap = SAFE_CASCADE_CAP;
    const cascading = this.config.cascade?.enabled ?? false;

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
        grid = this.cascadeRefill(grid, res, useFg);
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

  /**
   * Refill the grid after a win, per config.cascade.refill:
   *  - fillDown   : remove winning cells, collapse down, fill from the top.
   *  - clearMatch : also remove every cell sharing a winning symbol id.
   *  - respin     : refill the cleared cells in place (no gravity).
   */
  private cascadeRefill(grid: GridResult, res: EvalResult, useFg: boolean): GridResult {
    const method = this.config.cascade?.refill ?? 'fillDown';
    const remove = new Set<string>();
    for (const w of res.wins) {
      for (const c of w.cells) remove.add(`${c.col}:${c.row}`);
    }
    if (method === 'clearMatch') {
      const winIds = new Set(res.wins.map((w) => w.symbolId));
      for (let col = 0; col < grid.columns.length; col++) {
        for (let row = 0; row < grid.columns[col].length; row++) {
          if (winIds.has(grid.columns[col][row])) remove.add(`${col}:${row}`);
        }
      }
    }

    const pick = (col: number): string => {
      const { ids, weights } = reelSymbolWeights(this.config, col, useFg);
      return ids[this.rng.weightedIndex(weights)];
    };

    if (method === 'respin') {
      // refill the cleared cells where they are; nothing collapses
      const columns = grid.columns.map((column, col) =>
        column.map((id, row) => (remove.has(`${col}:${row}`) ? pick(col) : id)),
      );
      return { cols: grid.cols, shape: [...grid.shape], columns };
    }

    // fillDown / clearMatch: survivors fall, fresh symbols fill the top
    const columns = grid.columns.map((column, col) => {
      const survivors: string[] = [];
      for (let row = 0; row < column.length; row++) {
        if (!remove.has(`${col}:${row}`)) survivors.push(column[row]);
      }
      while (survivors.length < column.length) survivors.push(pick(col));
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
