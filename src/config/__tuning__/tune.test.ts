import { describe, it, expect } from 'vitest';
import { defaultConfig } from '@/config/defaultConfig';
import { runSimulation } from '@/engine/simulation';

/**
 * Verifies the *shipped* defaultConfig (weight math) converges near its targets
 * (Target RTP ≈ 0.985 · BF ≈ 1/150). Run: npx vitest run.
 */
describe('default config math verification', () => {
  it('RTP ≈ 0.985 and BF in a sane range over 400k rounds', async () => {
    const r = await runSimulation(defaultConfig, { rounds: 400_000, bet: 100, seed: 7, chunk: 100_000 });
    // eslint-disable-next-line no-console
    console.log(
      `[SHIPPED] RTP=${(r.actualRTP * 100).toFixed(2)}% BF=1/${r.actualBF.toFixed(0)} hit=${(r.hitRate * 100).toFixed(1)}% maxWinX=${r.maxWinX.toFixed(1)} ${Math.round(r.roundsPerSec)} rounds/s`,
    );
    expect(r.actualRTP).toBeGreaterThan(0.95);
    expect(r.actualRTP).toBeLessThan(1.02);
    expect(r.actualBF).toBeGreaterThan(90);
    expect(r.actualBF).toBeLessThan(180);
  }, 120_000);
});
