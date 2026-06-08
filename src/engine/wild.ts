import type { GameConfig, SymbolDefinition, WildConfig } from '@/types';

/**
 * Wild engine helpers. Pure functions consumed by the pay engine.
 * Whether a symbol behaves as a wild is derived from its type array, never
 * hard-coded by id.
 */

export function isWild(sym: SymbolDefinition | undefined): boolean {
  return !!sym?.type.includes('wild');
}

export function isScatter(sym: SymbolDefinition | undefined): boolean {
  return !!sym?.type.includes('scatter');
}

/** Whether a wild symbol can substitute for the given target symbol id. */
export function wildSubstitutes(
  wildCfg: WildConfig | undefined,
  targetId: string,
): boolean {
  if (!wildCfg) return true; // default: wild subs for everything payable
  if (wildCfg.substituteSymbols.includes('*')) return true;
  return wildCfg.substituteSymbols.includes(targetId);
}

/** Multiplier a wild contributes when participating in a win. */
export function wildMultiplier(wildCfg: WildConfig | undefined): number {
  return wildCfg?.multiplier ?? 1;
}

/** Build a quick id -> SymbolDefinition lookup. */
export function symbolIndex(config: GameConfig): Map<string, SymbolDefinition> {
  const m = new Map<string, SymbolDefinition>();
  for (const s of config.symbols) m.set(s.id, s);
  return m;
}
