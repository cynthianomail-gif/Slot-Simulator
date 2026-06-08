import type { FeatureConfigEntry } from '@/types';
import type { FeaturePlugin, FeatureRunContext, FeatureRunResult } from './types';

/**
 * Free Game feature.
 *
 * params:
 *   spins          : number of free spins awarded (default 10)
 *   kind           : spin kind label (default 'freegame')
 *   winMultiplier  : flat multiplier applied to free-spin wins (default 1)
 *   retriggerSymbol: scatter id that retriggers (optional)
 *   retriggerCount : count required to retrigger (default 3)
 *   retriggerSpins : extra spins per retrigger (default = spins)
 */
export class FreeGameFeature implements FeaturePlugin {
  readonly type = 'freeGame';
  state: FeaturePlugin['state'] = 'INACTIVE';

  run(entry: FeatureConfigEntry, ctx: FeatureRunContext): FeatureRunResult {
    const p = entry.params;
    const baseSpins = num(p.spins, 10);
    const kind = (p.kind as string) ?? 'freegame';
    const mult = num(p.winMultiplier, 1);
    const retrigSymbol = p.retriggerSymbol as string | undefined;
    const retrigCount = num(p.retriggerCount, 3);
    const retrigSpins = num(p.retriggerSpins, baseSpins);

    this.state = 'TRIGGERED';
    ctx.emit('FEATURE_START', { feature: this.type, id: entry.id, spins: baseSpins });

    this.state = 'INITIALIZE';
    let remaining = baseSpins;
    let total = 0;
    let retriggered = 0;
    const spins = [];

    this.state = 'RUNNING';
    while (remaining > 0) {
      remaining--;
      const spin = ctx.runSpin(kind);
      // apply free-game multiplier
      const won = spin.spinWin * mult;
      spin.spinWin = won;
      total += won;
      spins.push(spin);

      if (retrigSymbol) {
        const count = lastGridCount(spin, retrigSymbol);
        if (count >= retrigCount) {
          remaining += retrigSpins;
          retriggered++;
          ctx.emit('FG_TRIGGER', { retrigger: true, add: retrigSpins });
        }
      }
    }

    this.state = 'COMPLETE';
    ctx.emit('FEATURE_END', { feature: this.type, id: entry.id, win: total, retriggered });
    this.state = 'INACTIVE';

    return { spins, win: total, retriggered };
  }
}

function num(v: unknown, d: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : d;
}

function lastGridCount(spin: { grid: { columns: string[][] } }, id: string): number {
  let n = 0;
  for (const col of spin.grid.columns) for (const s of col) if (s === id) n++;
  return n;
}
