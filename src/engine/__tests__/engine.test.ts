import { describe, it, expect } from 'vitest';
import { defaultConfig } from '@/config/defaultConfig';
import { createRng } from '../rng';
import { GameEngine } from '../gameEngine';
import { EventLog } from '../eventLog';
import { runSimulation } from '../simulation';
import { evaluate } from '../pay';
import { clone } from '@/lib/utils';

function engineWithSeed(seed: number) {
  const log = new EventLog(10);
  log.enabled = false;
  return new GameEngine(defaultConfig, createRng(seed), log);
}

describe('RNG determinism', () => {
  it('same seed reproduces the same stream', () => {
    const a = createRng(123456);
    const b = createRng(123456);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('different seeds diverge', () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(a.next()).not.toEqual(b.next());
  });
});

describe('GameEngine determinism', () => {
  it('two engines with the same seed produce identical round wins', () => {
    const e1 = engineWithSeed(999);
    const e2 = engineWithSeed(999);
    const w1 = Array.from({ length: 50 }, () => e1.playRound({ bet: 100 }).totalWin);
    const w2 = Array.from({ length: 50 }, () => e2.playRound({ bet: 100 }).totalWin);
    expect(w1).toEqual(w2);
  });
});

describe('Pay engine', () => {
  it('pays 5-of-a-kind on the middle line per config payout', () => {
    // Build a deterministic 5x3 grid: middle row all H1, other cells scatter
    // (scatter never pays a line), so exactly one payline win occurs.
    const grid = {
      cols: 5,
      shape: [3, 3, 3, 3, 3],
      columns: Array.from({ length: 5 }, () => ['SC', 'H1', 'SC']),
    };
    const res = evaluate(defaultConfig, grid);
    const h1Win = res.wins.find((w) => w.symbolId === 'H1' && w.count === 5);
    expect(h1Win).toBeTruthy();
    const expected = defaultConfig.symbols.find((s) => s.id === 'H1')!.payout[2]; // 5-of-a-kind tier
    expect(h1Win!.pay).toBe(expected);
  });
});

describe('Cascade mechanic', () => {
  it('removes wins and refills until no win (gridSteps grows)', () => {
    // 3x1 board, one payline, weight mode, a single always-winning symbol.
    const cfg = clone(defaultConfig);
    cfg.cascade = { enabled: true, showStepWin: true, refill: 'fillDown' };
    cfg.math.mode = 'weight';
    cfg.grid = { cols: 3, shape: [1, 1, 1] };
    cfg.pay = { mode: 'payline', minMatch: 3, paylines: [{ id: 1, rows: [0, 0, 0] }] };
    cfg.symbols = [{ id: 'X', name: 'X', type: ['normal'], weight: 1, payout: [5, 5, 5] }];
    cfg.reels.strips = [['X'], ['X'], ['X']];
    cfg.triggers = [];
    cfg.features = [];

    const log = new EventLog(10);
    log.enabled = false;
    const engine = new GameEngine(cfg, createRng(1), log);
    const round = engine.playRound({ bet: 1 });
    const base = round.spins[0];

    // Every refill is X again -> cascades until the engine's safety cap.
    expect(base.gridSteps.length).toBeGreaterThan(1);
    expect(base.cascades.length).toBe(base.gridSteps.length);
    expect(round.totalWin).toBeGreaterThan(0);
  });
});

describe('Simulation', () => {
  it('runs 20k rounds, returns sane RTP & fires bonuses', async () => {
    const report = await runSimulation(defaultConfig, {
      rounds: 20_000,
      bet: 100,
      seed: 42,
      chunk: 5000,
    });
    expect(report.totalRounds).toBe(20_000);
    expect(report.totalWager).toBe(20_000 * 100);
    // RTP should be a positive, finite, non-absurd number
    expect(report.actualRTP).toBeGreaterThan(0);
    expect(report.actualRTP).toBeLessThan(50);
    // bonuses should trigger at least occasionally
    expect(report.bonusCount).toBeGreaterThan(0);
  });
});
