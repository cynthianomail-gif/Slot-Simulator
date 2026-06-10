import type { WinTier } from '@/types';
import type { IRng } from './rng';

/**
 * Win-distribution tracker.
 *
 * After each round the engine calls `adjust()` to:
 *  1. Decide which tier this round *should* fall into (deficit-weighted).
 *  2. If the natural result already matches → keep it.
 *  3. Otherwise → scale totalWin into the target tier's range.
 *  4. Position within that range is biased by cumulative RTP error so the
 *     long-run return converges toward the target.
 *
 * RTP is the hard constraint; distribution percentages are best-effort.
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
   * Adjust a round's total win to match the distribution + RTP targets.
   * @returns the (possibly scaled) totalWin.
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

    const winX = naturalTotalWin / bet;
    const group = isFeatureRound ? 'FG' : 'NG';

    const naturalIdx = this.findTier(winX, group);
    const targetIdx = this.pickTargetTier(group, rng);

    if (targetIdx < 0) {
      // No tiers for this group — pass through
      this.book(naturalIdx, bet, naturalTotalWin);
      return naturalTotalWin;
    }

    if (naturalIdx === targetIdx) {
      // Already in the right tier — keep natural result
      this.book(targetIdx, bet, naturalTotalWin);
      return naturalTotalWin;
    }

    // Scale win into the target tier's range, RTP-aware
    const t = this.tiers[targetIdx];
    const lo = t.min;
    const hi = t.max ?? this.unboundedCap(t);

    // RTP bias: how far off are we from targetRTP?
    const actualRTP = this.totalBet > 0 ? this.totalWin / this.totalBet : this.targetRTP;
    const rtpError = this.targetRTP - actualRTP; // >0 → need more win, <0 → need less

    // Map rtpError to a 0..1 bias (0.5 = center of range)
    const bias = clamp(0.5 + rtpError * 5, 0.05, 0.95);

    // Deterministic position within the range
    const spread = hi - lo;
    const scaledX = lo + bias * spread + (rng.next() - 0.5) * spread * 0.1;
    const clampedX = clamp(scaledX, lo, hi);
    const scaledWin = clampedX * bet;

    this.book(targetIdx, bet, scaledWin);
    return scaledWin;
  }

  /* ------------------------------------------------------------------ */

  private findTier(winX: number, group: string): number {
    for (let i = 0; i < this.tiers.length; i++) {
      const t = this.tiers[i];
      if (t.group !== group) continue;
      if (winX >= t.min && (t.max === null || winX <= t.max)) return i;
    }
    return -1;
  }

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
    // Sensible upper bound for unbounded tiers (32+, 600+, …)
    return Math.max(t.min * 3, t.min + 200);
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
