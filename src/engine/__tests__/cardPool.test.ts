import { describe, it, expect } from 'vitest';
import { defaultConfig } from '@/config/defaultConfig';
import { createRng } from '../rng';
import { CardPool } from '../cardPool';
import { runSimulation } from '../simulation';
import { clone } from '@/lib/utils';

/**
 * 產牌→取牌 model verification:
 *  - challenge rate is solved so analytic RTP = targetRTP
 *  - simulated RTP converges near the target
 *  - FG 保底 (minWinX) holds for every session
 *  - 占比 changes actually move the observed hit rate
 */
describe('CardPool (產牌→取牌)', () => {
  it('solves a challenge rate that locks analytic RTP to the target', () => {
    const pool = new CardPool(defaultConfig, createRng(11));
    expect(pool.info.challengeQ).toBeGreaterThan(0);
    expect(pool.info.challengeQ).toBeLessThanOrEqual(1);
    expect(pool.info.expectedRTP).toBeCloseTo(defaultConfig.math.targetRTP, 6);
  });

  it('simulated RTP converges near targetRTP and FG 保底 20x holds', async () => {
    const r = await runSimulation(defaultConfig, {
      rounds: 1_000_000,
      bet: 100,
      seed: 3,
      chunk: 250_000,
    });
    // eslint-disable-next-line no-console
    console.log(
      `[POOL] RTP=${(r.actualRTP * 100).toFixed(2)}% hit=${(r.hitRate * 100).toFixed(1)}% BF=1/${r.actualBF.toFixed(0)} ` +
        `FG sessions=${r.modeStats.FG?.sessions ?? 0} minFG=${(r.modeStats.FG?.minSessionX ?? 0).toFixed(1)}x`,
    );
    // 高倍長尾（360x/900x 合成場）讓收斂偏慢 — 1M 局容差取 ±4%
    expect(Math.abs(r.actualRTP - defaultConfig.math.targetRTP)).toBeLessThan(0.04);

    const fg = r.modeStats.FG;
    expect(fg).toBeTruthy();
    expect(fg!.sessions).toBeGreaterThan(100);
    // 保底: every FG session pays at least minWinX (20x)
    expect(fg!.minSessionX).toBeGreaterThanOrEqual(20 - 1e-6);
  }, 120_000);

  it('占比 shifts move the observed hit rate (取牌 responds to weights)', async () => {
    // all-low NG tiers → high challenge win rate → higher observed hit rate
    const lowCfg = clone(defaultConfig);
    lowCfg.math.winDistribution = lowCfg.math.winDistribution!.map((t) =>
      t.group === 'NG' ? { ...t, percent: t.label === 'NG低倍' ? 100 : 0 } : t,
    );
    // all-high NG tiers → low challenge win rate → lower observed hit rate
    const highCfg = clone(defaultConfig);
    highCfg.math.winDistribution = highCfg.math.winDistribution!.map((t) =>
      t.group === 'NG' ? { ...t, percent: t.label === 'NG大倍' ? 100 : 0 } : t,
    );

    const low = await runSimulation(lowCfg, { rounds: 200_000, bet: 100, seed: 5, chunk: 200_000 });
    const high = await runSimulation(highCfg, { rounds: 200_000, bet: 100, seed: 5, chunk: 200_000 });
    // eslint-disable-next-line no-console
    console.log(
      `[POOL] hit(all-low)=${(low.hitRate * 100).toFixed(1)}% hit(all-high)=${(high.hitRate * 100).toFixed(1)}% ` +
        `RTP(low)=${(low.actualRTP * 100).toFixed(1)}% RTP(high)=${(high.actualRTP * 100).toFixed(1)}%`,
    );
    expect(low.hitRate).toBeGreaterThan(high.hitRate);
    // both still lock RTP (高倍長尾 → 寬容差)
    expect(Math.abs(low.actualRTP - 0.985)).toBeLessThan(0.08);
    expect(Math.abs(high.actualRTP - 0.985)).toBeLessThan(0.15);
  }, 120_000);
});
