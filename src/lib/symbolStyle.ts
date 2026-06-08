import type { SymbolDefinition } from '@/types';

/** Deterministic color + glyph for a symbol, derived from its id/type. */
export function symbolStyle(sym: SymbolDefinition | undefined, id: string): {
  bg: string;
  fg: string;
  glyph: string;
  ring: string;
} {
  const palette: Record<string, { bg: string; fg: string; ring: string }> = {
    WILD: { bg: 'bg-gradient-to-br from-fuchsia-600 to-purple-700', fg: 'text-white', ring: 'ring-fuchsia-400' },
    SC: { bg: 'bg-gradient-to-br from-amber-500 to-orange-600', fg: 'text-white', ring: 'ring-amber-300' },
    BO: { bg: 'bg-gradient-to-br from-yellow-400 to-yellow-600', fg: 'text-yellow-950', ring: 'ring-yellow-200' },
    H1: { bg: 'bg-gradient-to-br from-sky-400 to-blue-600', fg: 'text-white', ring: 'ring-sky-300' },
    H2: { bg: 'bg-gradient-to-br from-rose-500 to-red-600', fg: 'text-white', ring: 'ring-rose-300' },
    H3: { bg: 'bg-gradient-to-br from-emerald-500 to-green-600', fg: 'text-white', ring: 'ring-emerald-300' },
    H4: { bg: 'bg-gradient-to-br from-indigo-500 to-violet-600', fg: 'text-white', ring: 'ring-indigo-300' },
  };
  const lowDefault = { bg: 'bg-secondary', fg: 'text-foreground', ring: 'ring-border' };
  const base = palette[id] ?? lowDefault;

  const glyphMap: Record<string, string> = {
    WILD: 'W', SC: '★', BO: '◉', H1: '◆', H2: '♦', H3: '❖', H4: '✦',
    LA: 'A', LK: 'K', LQ: 'Q', LJ: 'J',
  };
  const glyph = glyphMap[id] ?? (sym?.name?.[0] ?? id[0] ?? '?');

  return { ...base, glyph };
}
