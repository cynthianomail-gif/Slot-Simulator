import type { WinTier } from '@/types';
import type { IRng } from './rng';

/**
 * Win-distribution tracker.
 *
 * RTP is the **hard** constraint; tier percentages are best-effort.
 *
 * Algorithm per round:
 *  1. Pick target tier (deficit-weighted random).
 *  2. Compute the ideal winX that makes cumulative RTP converge to target:
 *       idealWin = targetRTP × (totalBet + bet) − totalWin
 *       idealWinX = idealWin / bet
 *  3. Add a small random jitter for variance.
 *  4. Clamp the result into the target tier's [min, max] range.
 *  5. If clamping pushes RTP away from target, subsequent rounds compensate.
 */
export class WinDistTracker {
  private tierCounts: number[];
  private totalRounds = 0;
  private totalBet = 0;
  private totalWin = 0;

  constructor(
    private tiers: WinTier[],
    private targetRTP: number,
  ) {
    this.tierCounts = new Array(tiers.length).fill(0);
  }

  reset(): void {
    this.tierCounts.fill(0);
    this.totalRounds = 0;
    this.totalBet = 0;
    this.totalWin = 0;
  }

  /**
   * Adjust a round's total win.
   * @returns the adjusted totalWin (always ≥ 0).
   */
  adjust(
    naturalTotalWin: number,
    bet: number,
    isFeatureRound: boolean,
    rng: IRng,
  ): number {
    if (this.tiers.length === 0 || bet <= 0) {
      return naturalTotalWin;
    }

    const group = isFeatureRound ? 'FG' : 'NG';
    const targetIdx = this.pickTargetTier(group, rng);

    if (targetIdx < 0) {
      // No tiers defined for this group — pass through natural result
      this.book(-1, bet, naturalTotalWin);
      return naturalTotalWin;
    }

    const t = this.tiers[targetIdx];
    const lo = t.min;
    const hi = t.max ?? this.unboundedCap(t);

    // --- RTP-first: compute the ideal winX to converge RTP ---
    const newTotalBet = this.totalBet + bet;
    const idealWin = this.targetRTP * newTotalBet - this.totalWin;
    let idealX = idealWin / bet;

    // Add jitter so results aren't perfectly smooth (±15% of tier spread)
    const spread = hi - lo;
    idealX += (rng.next() - 0.5) * spread * 0.3;

    // Clamp into the tier's range (this is the distribution constraint)
    const clampedX = clamp(idealX, lo, hi);

    // Final win can't be negative
    const adjustedWin = Math.max(0, clampedX * bet);

    this.book(targetIdx, bet, adjustedWin);
    return adjustedWin;
  }

  /* ------------------------------------------------------------------ */

  private pickTargetTier(group: string, rng: IRng): number {
    const cands: { idx: number; deficit: number }[] = [];

    for (let i = 0; i < this.tiers.length; i++) {
      const t = this.tiers[i];
      if (t.group !== group) continue;
      const actual = this.totalRounds > 0
        ? (this.tierCounts[i] / this.totalRounds) * 100
        : 0;
      cands.push({ idx: i, deficit: t.percent - actual });
    }

    if (cands.length === 0) return -1;

    // Weighted random: higher deficit → higher weight
    const minDef = Math.min(...cands.map((c) => c.deficit));
    const weights = cands.map((c) => Math.max(0.01, c.deficit - minDef + 1));
    const totalW = weights.reduce((s, w) => s + w, 0);

    let r = rng.next() * totalW;
    for (let i = 0; i < cands.length; i++) {
      r -= weights[i];
      if (r <= 0) return cands[i].idx;
    }
    return cands[cands.length - 1].idx;
  }

  private book(tierIdx: number, bet: number, win: number): void {
    this.totalRounds++;
    this.totalBet += bet;
    this.totalWin += win;
    if (tierIdx >= 0 && tierIdx < this.tierCounts.length) {
      this.tierCounts[tierIdx]++;
    }
  }

  private unboundedCap(t: WinTier): number {
    // For unbounded tiers (32+, 600+), use a sensible upper bound
    // that won't blow up RTP when clamped.
    return Math.max(t.min * 2, t.min + 50);
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
