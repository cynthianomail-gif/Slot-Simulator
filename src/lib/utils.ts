import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** shadcn/ui classname helper */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Format a number as a localized currency-ish string (no symbol). */
export function fmt(n: number, digits = 2): string {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Format an integer with thousands separators. */
export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/** Format a ratio as percentage. */
export function pct(n: number, digits = 2): string {
  return `${(n * 100).toFixed(digits)}%`;
}

/** Deep clone via structuredClone with JSON fallback. */
export function clone<T>(v: T): T {
  if (typeof structuredClone === 'function') return structuredClone(v);
  return JSON.parse(JSON.stringify(v)) as T;
}
