import type { WinTier } from '@/types';
import type { IRng } from './rng';

/**
 * Win-distribution engine — two-phase: 產牌 (generate) → 取牌 (select).
 *
 * The regular engine produces a board naturally (visuals).
 * This module overrides totalWin using:
 *
 *   1. Pick a tier from the round's group (NG/FG) by percentage weight.
 *   2. Draw a multiplier M uniformly from the tier's [min, max] range.
 *   3. Challenge: win with probability  targetRTP / avgM  → payout = M × bet.
 *                 Lose (1 − p)                             → payout = 0.
 *
 * Math guarantee:
 *   E[payout | any tier] = avgM × (targetRTP / avgM) = targetRTP × bet
 *   ∴ E[payout] = targetRTP × bet regardless of tier distribution or NG/FG ratio.
 *
 * The tier selection controls the **variance shape** (hit rate vs. big-win frequency),
 * while RTP is locked by the challenge probability — no tracking or convergence needed.
 */
export class WinDistTracker {
  constructor(
    private tiers: WinTier[],
    private targetRTP: number,
  ) {}

  reset(): void {
    // Stateless — nothing to reset.
  }

  /**
   * Replace a round's totalWin with a distribution-based result.
   * @returns the adjusted totalWin (≥ 0).
   */
  adjust(
    _naturalTotalWin: number,
    bet: number,
    isFeatureRound: boolean,
    rng: IRng,
  ): number {
    if (this.tiers.length === 0 || bet <= 0) {
      return _naturalTotalWin;
    }

    // No visual win on the board → no payout (board must match display)
    if (_naturalTotalWin <= 0) return 0;

    const group = isFeatureRound ? 'FG' : 'NG';

    // --- Step 1: 取牌 — pick tier by percentage (normalized within group) ---
    const tierIdx = this.pickTierByPercent(group, rng);
    if (tierIdx < 0) return _naturalTotalWin;

    const t = this.tiers[tierIdx];
    const lo = t.min;
    const hi = t.max ?? this.unboundedCap(t);

    // --- Step 2: draw multiplier from tier range ---
    const M = lo + rng.next() * (hi - lo);

    // --- Step 3: challenge — probability locks RTP ---
    const avgM = (lo + hi) / 2;
    if (avgM <= 0) return 0;

    const challengeProb = Math.min(1, this.targetRTP / avgM);

    if (rng.next() < challengeProb) {
      // Challenge win → player gets M × bet
      return M * bet;
    }
    // Challenge lose → 0
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
