import type { WinTier } from '@/types';
import type { IRng } from './rng';

/**
 * Win-distribution engine — 產牌→取牌→挑戰.
 *
 * Only activates when the board has a natural win (盤面有贏分).
 * The payout is adjusted by the tracked natural hit rate so that
 * E[payout] = targetRTP × bet regardless of the game's natural
 * win frequency.
 *
 * For each tier with average multiplier avgM:
 *   ratio = targetRTP / (hitRate × avgM)
 *
 *   ratio < 1 (high multiplier tier):
 *     Challenge — win with probability ratio → pay M × bet
 *     E = avgM × ratio = targetRTP / hitRate  ✓
 *
 *   ratio ≥ 1 (low multiplier tier):
 *     Always pay, boost payout → pay M × ratio × bet
 *     E = avgM × ratio = targetRTP / hitRate  ✓
 *
 * Overall: E[payout] = hitRate × (targetRTP / hitRate) × bet
 *        = targetRTP × bet  ✓
 */
export class WinDistTracker {
  private totalRounds = 0;
  private winningRounds = 0;

  constructor(
    private tiers: WinTier[],
    private targetRTP: number,
  ) {}

  reset(): void {
    this.totalRounds = 0;
    this.winningRounds = 0;
  }

  private get hitRate(): number {
    if (this.totalRounds < 20) return 1;
    return this.winningRounds / this.totalRounds;
  }

  adjust(
    naturalTotalWin: number,
    bet: number,
    isFeatureRound: boolean,
    rng: IRng,
  ): number {
    if (this.tiers.length === 0 || bet <= 0) {
      return naturalTotalWin;
    }

    this.totalRounds++;
    if (naturalTotalWin > 0) this.winningRounds++;

    if (naturalTotalWin <= 0) return 0;

    const group = isFeatureRound ? 'FG' : 'NG';

    // Step 1: pick tier by percentage (normalized within group)
    const tierIdx = this.pickTierByPercent(group, rng);
    if (tierIdx < 0) return naturalTotalWin;

    const t = this.tiers[tierIdx];
    const lo = t.min;
    const hi = t.max ?? this.unboundedCap(t);

    // Step 2: draw multiplier from tier range
    const M = lo + rng.next() * (hi - lo);

    // Step 3: challenge or boost — ratio locks RTP
    const avgM = (lo + hi) / 2;
    if (avgM <= 0) return 0;

    const hr = this.hitRate;
    if (hr <= 0) return 0;
    const ratio = this.targetRTP / (hr * avgM);

    if (ratio >= 1) {
      // Low-multiplier tier: always pay, boost to compensate
      return M * ratio * bet;
    }
    // High-multiplier tier: challenge
    if (rng.next() < ratio) {
      return M * bet;
    }
    return 0;
  }

  /* ------------------------------------------------------------------ */

  private pickTierByPercent(group: string, rng: IRng): number {
    const cands: { idx: number; pct: number }[] = [];
    for (let i = 0; i < this.tiers.length; i++) {
      if (this.tiers[i].group === group) {
        cands.push({ idx: i, pct: this.tiers[i].percent });
      }
    }
    if (cands.length === 0) return -1;

    const totalPct = cands.reduce((s, c) => s + c.pct, 0);
    let r = rng.next() * totalPct;
    for (const c of cands) {
      r -= c.pct;
      if (r <= 0) return c.idx;
    }
    return cands[cands.length - 1].idx;
  }

  private unboundedCap(t: WinTier): number {
    return Math.max(t.min * 2, t.min + 50);
  }
}
