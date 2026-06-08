import type { FeatureConfigEntry } from '@/types';
import type { FeaturePlugin, FeatureRunContext, FeatureRunResult } from './types';

/**
 * Hold & Spin (a.k.a. Respin / Lock & Spin / Link).
 *
 * Models the classic "collect coins, reset spins when a new one lands" loop.
 * Because the host runSpin is generic, this plugin counts the collector symbol
 * on each produced grid; landing more collectors than the previous spin resets
 * the respin counter. Ends when the board fills or respins run out.
 *
 * params:
 *   respins        : respins granted, reset on new landing (default 3)
 *   collectorSymbol: symbol id treated as the collector (default 'bonus')
 *   boardSize      : total cells; when collectors reach it, force end (optional)
 *   kind           : spin kind label (default 'hold')
 */
export class HoldAndSpinFeature implements FeaturePlugin {
  readonly type = 'holdAndSpin';
  state: FeaturePlugin['state'] = 'INACTIVE';

  run(entry: FeatureConfigEntry, ctx: FeatureRunContext): FeatureRunResult {
    const p = entry.params;
    const respins = num(p.respins, 3);
    const collector = (p.collectorSymbol as string) ?? 'bonus';
    const boardSize = num(
      p.boardSize,
      ctx.config.grid.shape.reduce((a, b) => a + b, 0),
    );
    const kind = (p.kind as string) ?? 'hold';

    this.state = 'TRIGGERED';
    ctx.emit('FEATURE_START', { feature: this.type, id: entry.id });
    this.state = 'INITIALIZE';

    const spins = [];
    let total = 0;
    let retriggered = 0;
    let remaining = respins;
    let collected = 0;

    this.state = 'RUNNING';
    while (remaining > 0) {
      remaining--;
      const spin = ctx.runSpin(kind);
      total += spin.spinWin;
      spins.push(spin);

      const onBoard = countOf(spin, collector);
      if (onBoard > collected) {
        collected = onBoard;
        remaining = respins; // new landing resets respins
        retriggered++;
        ctx.emit('BONUS_TRIGGER', { collected });
      }
      if (collected >= boardSize) break; // board full -> jackpot end
    }

    this.state = 'COMPLETE';
    ctx.emit('FEATURE_END', {
      feature: this.type,
      id: entry.id,
      win: total,
      collected,
    });
    this.state = 'INACTIVE';
    return { spins, win: total, retriggered };
  }
}

function num(v: unknown, d: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : d;
}

function countOf(spin: { grid: { columns: string[][] } }, id: string): number {
  let n = 0;
  for (const col of spin.grid.columns) for (const s of col) if (s === id) n++;
  return n;
}
