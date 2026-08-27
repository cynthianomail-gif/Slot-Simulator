import { useEffect, useState, type CSSProperties } from 'react';
import type { SymbolDefinition } from '@/types';
import { symbolStyle } from '@/lib/symbolStyle';
import { cn } from '@/lib/utils';

interface SymbolFaceProps {
  sym: SymbolDefinition | undefined;
  id: string;
  /** Layout / ring classes applied when a picture is shown. */
  className?: string;
  /**
   * Classes used instead of `className` when the generated glyph is shown.
   * Lets the board keep its coloured ring on glyph symbols while picture
   * symbols stay frameless. Falls back to `className`.
   */
  glyphClassName?: string;
  style?: CSSProperties;
}

/**
 * One symbol face. Renders `sym.image` when the symbol carries a picture URL
 * (or a data: URI) and falls back to the generated colour + glyph whenever the
 * symbol has no image or the image fails to load — a broken URL must never
 * leave a blank cell on the board.
 */
export function SymbolFace({ sym, id, className, glyphClassName, style }: SymbolFaceProps) {
  const src = sym?.image?.trim();
  const [broken, setBroken] = useState(false);

  // a new URL deserves a fresh attempt
  useEffect(() => setBroken(false), [src]);

  if (src && !broken) {
    return (
      <div className={cn('overflow-hidden', className)} style={style}>
        <img
          src={src}
          alt={sym?.name ?? id}
          draggable={false}
          className="h-full w-full select-none object-contain"
          onError={() => setBroken(true)}
        />
      </div>
    );
  }

  const st = symbolStyle(sym, id);
  return (
    <div className={cn(st.bg, st.fg, glyphClassName ?? className)} style={style}>
      {st.glyph}
    </div>
  );
}
