import type { FeatureConfigEntry } from '@/types';
import type { FeaturePlugin, FeatureRunContext, FeatureRunResult } from './types';

/**
 * Respin feature.
 *
 * params:
 *   maxRespins    : hard cap on respins (default 3)
 *   resetOnWin    : if true, every winning respin resets the counter (default true)
 *   kind          : spin kind label (default 'respin')
 */
export class RespinFeature implements FeaturePlugin {
  readonly type = 'respin';
  state: FeaturePlugin['state'] = 'INACTIVE';

  run(entry: FeatureConfigEntry, ctx: FeatureRunContext): FeatureRunResult {
    const p = entry.params;
    const maxRespins = num(p.maxRespins, 3);
    const resetOnWin = p.resetOnWin !== false;
    const kind = (p.kind as string) ?? 'respin';

    this.state = 'TRIGGERED';
    ctx.emit('FEATURE_START', { feature: this.type, id: entry.id });
    this.state = 'INITIALIZE';

    const spins = [];
    let total = 0;
    let retriggered = 0;
    let remaining = maxRespins;

    this.state = 'RUNNING';
    while (remaining > 0) {
      remaining--;
      const spin = ctx.runSpin(kind);
      total += spin.spinWin;
      spins.push(spin);
      if (resetOnWin && spin.spinWin > 0) {
        remaining = maxRespins;
        retriggered++;
      }
    }

    this.state = 'COMPLETE';
    ctx.emit('FEATURE_END', { feature: this.type, id: entry.id, win: total });
    this.state = 'INACTIVE';
    return { spins, win: total, retriggered };
  }
}

function num(v: unknown, d: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : d;
}
