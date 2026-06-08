import { describe, it, expect } from 'vitest';
import { defaultConfig } from '@/config/defaultConfig';
import { runSimulation } from '@/engine/simulation';

/**
 * Verifies the *shipped* defaultConfig math converges on its targets
 * (Target RTP 96% · Target BF 1 in 150). Run: npx vitest run.
 */
describe('default config math verification', () => {
  it('RTP ≈ 96% and BF ≈ 1/150 over 400k rounds', async () => {
    const r = await runSimulation(defaultConfig, { rounds: 400_000, bet: 100, seed: 7, chunk: 100_000 });
    // eslint-disable-next-line no-console
    console.log(
      `[SHIPPED] RTP=${(r.actualRTP * 100).toFixed(2)}% BF=1/${r.actualBF.toFixed(0)} hit=${(r.hitRate * 100).toFixed(1)}% maxWinX=${(r.maxWin / 100).toFixed(0)} ${Math.round(r.roundsPerSec)} rounds/s`,
    );
    expect(r.actualRTP).toBeGreaterThan(0.93);
    expect(r.actualRTP).toBeLessThan(0.99);
    expect(r.actualBF).toBeGreaterThan(120);
    expect(r.actualBF).toBeLessThan(190);
  }, 120_000);
});
