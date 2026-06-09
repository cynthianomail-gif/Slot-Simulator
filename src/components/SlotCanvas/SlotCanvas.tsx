import { motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useGameStore } from '@/store/gameStore';
import { symbolStyle } from '@/lib/symbolStyle';
import { symbolIndex } from '@/engine/wild';
import { spinVisualWeights } from '@/engine/reel';
import { cn, fmtInt } from '@/lib/utils';
import type { AnimationType } from '@/types';

/**
 * Slot Canvas — presentation player that emulates real slot reel behaviour.
 *
 * Spin intro per animation mode (no fake random flicker — the reel is a real
 * scrolling strip):
 *   - rolling   : each reel is a vertical strip that scrolls and decelerates to
 *                 a stop on the result, staggered left→right, with a bounce.
 *   - independent (單格): every cell is its own little reel, each stopping at its
 *                 own random time.
 *   - flipping  : cells flip (rotateX) to reveal, staggered.
 *   - cascading : symbols drop in from above and stack; then winning symbols
 *                 highlight → clear → remaining + new symbols fall in, repeating
 *                 until there is no win (avalanche / 掉落式消除).
 *
 * When the timeline ends it calls store.finishPresentation().
 */

const FILLER = 16; // number of blur-by symbols on a spinning reel strip
const HEAD = 2; // filler kept above the result so the bounce never exposes the board

export function SlotCanvas() {
  const config = useGameStore((s) => s.config);
  const presentation = useGameStore((s) => s.presentation);
  const displayGrid = useGameStore((s) => s.displayGrid);
  const speed = useGameStore((s) => s.speed);
  const collectPots = useGameStore((s) => s.collectPots);
  const fcStages = useGameStore((s) => s.config.fakeCollect?.stages ?? 1);
  const bet = useGameStore((s) => s.bet);

  const idx = useMemo(() => symbolIndex(config), [config]);

  const cols = (presentation?.steps[0].grid.columns ?? displayGrid.columns).length;

  // Per-reel weighted "bag" of symbol ids for the spinning blur. Mirrors the
  // weight math: each reel samples its own eligible symbols by weight (so reel
  // exclusions and weights from the 圖示 tab show up in the spin visuals too).
  const reelPools = useMemo(() => {
    const pools: string[][] = [];
    for (let col = 0; col < cols; col++) {
      const { ids, weights } = spinVisualWeights(config, col);
      const bag: string[] = [];
      ids.forEach((id, i) => {
        const n = Math.max(1, Math.round(weights[i] * 2));
        for (let k = 0; k < n; k++) bag.push(id);
      });
      pools.push(bag.length ? bag : ids);
    }
    return pools;
  }, [config, cols]);
  const size = Math.max(40, Math.min(78, Math.floor(460 / Math.max(1, cols))));
  const gap = 8;

  // Which presentation id has finished its intro (reels landed). Derived from
  // this, `showIntro` flips synchronously during render the instant a new
  // presentation arrives — no one-frame stale board between spins.
  const [settledId, setSettledId] = useState<number | null>(null);
  const [mode, setMode] = useState<AnimationType>('rolling');
  const [cells, setCells] = useState<string[][]>(() => displayGrid.columns.map((c) => [...c]));
  const [winHi, setWinHi] = useState<Set<string>>(new Set());
  const [removing, setRemoving] = useState<Set<string>>(new Set());
  const [dropStep, setDropStep] = useState(0);

  const timers = useRef<number[]>([]);
  const clearAll = () => {
    timers.current.forEach((t) => clearTimeout(t));
    timers.current = [];
  };
  const at = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));

  const tile = (id: string, win = false) => {
    if (!id) {
      // empty slot — used by the cascade/flip intro before symbols appear
      return (
        <div
          style={{ width: size, height: size }}
          className="rounded-lg bg-background/30 ring-2 ring-inset ring-border/40"
        />
      );
    }
    const style = symbolStyle(idx.get(id), id);
    return (
      <div
        style={{ width: size, height: size, fontSize: size * 0.5 }}
        className={cn(
          'flex items-center justify-center rounded-lg font-black shadow-md ring-2 ring-inset',
          style.bg,
          style.fg,
          win ? 'ring-4 ring-yellow-300 shadow-yellow-400/50' : style.ring,
        )}
      >
        {style.glyph}
      </div>
    );
  };

  // Idle: mirror the settled board when there is no active presentation.
  useEffect(() => {
    if (presentation) return;
    setCells(displayGrid.columns.map((c) => [...c]));
    setWinHi(new Set());
    setRemoving(new Set());
    setDropStep(0);
  }, [displayGrid, presentation]);

  // Timeline: intro reels → settle → cascade replay → finish.
  useEffect(() => {
    if (!presentation) return;
    clearAll();
    const p = presentation;
    const turbo = speed === 'turbo';
    const target0 = p.steps[0].grid.columns;
    const colsN = target0.length;
    const rowsMax = Math.max(...target0.map((c) => c.length));

    setMode(p.mode);
    setWinHi(new Set());
    setRemoving(new Set());
    setDropStep(0);
    // Keep the board layer EMPTY for the whole intro, in every mode. The
    // spinning / flipping / dropping overlay is the only thing that shows the
    // result; the board only fills in at settle — the same frame the overlay is
    // removed, so there is no flash. This guarantees the final board can never
    // peek through behind the animation (e.g. a reel's bounce overshoot).
    setCells(target0.map((c) => c.map(() => '')));

    const totalCells = target0.reduce((n, c) => n + c.length, 0);

    // when does the intro reveal finish (ms)
    let introMs: number;
    if (p.mode === 'rolling') introMs = (colsN - 1) * p.stopIntervalMs + p.spinTimeMs + p.bounceMs + 60;
    else if (p.mode === 'flipping') introMs = (totalCells - 1) * p.stopIntervalMs + 440;
    else if (p.mode === 'cascading') introMs = (colsN - 1) * p.stopIntervalMs * 0.4 + (rowsMax - 1) * 55 + 520;
    else introMs = p.spinTimeMs + (totalCells - 1) * p.stopIntervalMs + p.bounceMs + 60; // independent

    const finish = () => {
      clearAll();
      useGameStore.getState().finishPresentation();
    };

    // settle
    at(introMs, () => {
      setCells(target0.map((c) => [...c]));
      setSettledId(p.id);
    });

    // cascade / win-highlight replay (in the settled grid)
    const stepHi = turbo ? 220 : 430;
    const stepClear = turbo ? 140 : 240;
    const stepDrop = turbo ? 170 : 300;
    let t = introMs;
    const schedule = (i: number) => {
      const s = p.steps[i];
      if (!s || s.winCells.length === 0) {
        at(t, finish);
        return;
      }
      const winSet = new Set(s.winCells);
      at(t, () => setWinHi(winSet));
      t += stepHi;
      if (p.mode === 'cascading' && p.steps[i + 1]) {
        at(t, () => setRemoving(winSet));
        t += stepClear;
        at(t, () => {
          setCells(p.steps[i + 1].grid.columns.map((c) => [...c]));
          setRemoving(new Set());
          setWinHi(new Set());
          setDropStep((d) => d + 1);
        });
        t += stepDrop;
        schedule(i + 1);
      } else {
        t += stepDrop;
        at(t, finish);
      }
    };
    schedule(0);

    return clearAll;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presentation?.id]);

  // Derived in render so the spin reels appear the same frame the presentation
  // arrives (prevents a one-frame flash of the previous board).
  const showIntro = presentation != null && presentation.id !== settledId;

  return (
    <div className="relative flex h-full w-full items-center justify-center p-4">
      <div className="relative rounded-xl border border-border bg-background/40 p-3">
        {/* Settled board — always rendered as the base layer. The spinning
            overlay below covers it until the reels land, so revealing it can
            never flash a different board. */}
        <div className="flex" style={{ gap }}>
          {cells.map((column, col) => (
            <div key={col} className="flex flex-col justify-center" style={{ gap }}>
              {Array.from({ length: column.length }).map((_, i) => {
                const row = column.length - 1 - i; // top first
                const key = `${col}:${row}`;
                const id = column[row];
                const isWin = winHi.has(key);
                const isRem = removing.has(key);
                return (
                  <motion.div
                    key={`${key}:${dropStep}`}
                    initial={dropStep > 0 ? { y: -(size + gap) * 1.3, opacity: 0 } : false}
                    animate={
                      isRem
                        ? { scale: 0, opacity: 0, rotate: 10 }
                        : { y: 0, opacity: 1, scale: isWin ? 1.12 : 1 }
                    }
                    transition={
                      isRem
                        ? { duration: 0.18 }
                        : dropStep > 0
                          ? { type: 'spring', stiffness: 460, damping: 22, delay: i * 0.03 }
                          : { type: 'spring', stiffness: 340, damping: 24 }
                    }
                    className={cn('relative', isWin && 'z-10')}
                  >
                    {tile(id, isWin)}
                  </motion.div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Spinning reels — overlaid exactly on top of the settled board
            (left/top match the container's p-3 padding). */}
        {showIntro && presentation && (
          <div key={presentation.id} className="absolute left-3 top-3 flex" style={{ gap }}>
            {presentation.steps[0].grid.columns.map((colArr, ci) => (
              <IntroColumn
                key={ci}
                colArr={colArr}
                ci={ci}
                totalCols={presentation.steps[0].grid.columns.length}
                mode={mode}
                size={size}
                gap={gap}
                spinTime={presentation.spinTimeMs}
                stopInterval={presentation.stopIntervalMs}
                pool={reelPools[ci] ?? reelPools[0] ?? []}
                tile={tile}
              />
            ))}
          </div>
        )}

        {/* 假收集 — persistent pots sit ABOVE each reel (outside the top of the
            board) and grow as they upgrade stages */}
        {collectPots && (
          <div className="absolute left-3 top-3 z-20">
            {collectPots.map((p, idx2) => (
              <CollectPotView
                key={idx2}
                cx={p.col * (size + gap) + size / 2}
                cell={size}
                stage={p.stage}
                stages={fcStages}
                bet={bet}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ----------------------------- 假收集 pot --------------------------------- */

interface CollectPotProps {
  cx: number;
  cell: number;
  stage: number;
  stages: number;
  bet: number;
}

function CollectPotView({ cx, cell, stage, stages, bet }: CollectPotProps) {
  const frac = stages > 1 ? (stage - 1) / (stages - 1) : 0.5;
  const potSize = cell * (0.55 + 0.5 * frac);
  const value = Math.round(bet * 0.2 * stage * stage); // grows with stage
  // sit above the board: top:-12 cancels the container's p-3, then the pot is
  // translated fully upward so its base rests on the board's top edge.
  return (
    <div className="absolute" style={{ left: cx, top: -12 }}>
      <motion.div
        className="grid -translate-x-1/2 -translate-y-full place-items-center rounded-2xl bg-gradient-to-br from-amber-300 to-amber-500 shadow-lg ring-2 ring-amber-200"
        animate={{ width: potSize, height: potSize }}
        transition={{ type: 'spring', stiffness: 320, damping: 17 }}
      >
        <motion.div
          key={stage}
          initial={{ scale: 0.7 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 420, damping: 14 }}
          className="flex flex-col items-center leading-none text-amber-950"
        >
          <span className="font-black" style={{ fontSize: potSize * 0.36 }}>$</span>
          <span className="font-black tabular-nums" style={{ fontSize: potSize * 0.22 }}>
            {fmtInt(value)}
          </span>
        </motion.div>
        <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-amber-900 px-1 text-[9px] font-bold text-amber-100">
          {stage}
        </span>
      </motion.div>
    </div>
  );
}

/* ----------------------- intro (spin) per-mode column --------------------- */

interface IntroColumnProps {
  colArr: string[];
  ci: number;
  totalCols: number;
  mode: AnimationType;
  size: number;
  gap: number;
  spinTime: number;
  stopInterval: number;
  pool: string[];
  tile: (id: string, win?: boolean) => ReactNode;
}

function IntroColumn({ colArr, ci, totalCols, mode, size, gap, spinTime, stopInterval, pool, tile }: IntroColumnProps) {
  const rows = colArr.length;

  if (mode === 'rolling') {
    // Every reel STARTS at the same instant; each one spins stopInterval longer
    // than the reel to its left, so they STOP one after another left→right.
    return (
      <ReelStrip
        target={colArr}
        size={size}
        gap={gap}
        delayMs={0}
        durationMs={spinTime + ci * stopInterval}
        pool={pool}
        tile={tile}
      />
    );
  }

  if (mode === 'independent') {
    // Each cell is its own little reel. They all start together and stop one at
    // a time in reading order — top-left first, across each row.
    return (
      <div className="flex flex-col justify-center" style={{ gap }}>
        {Array.from({ length: rows }).map((_, i) => {
          const row = rows - 1 - i; // i = visual position from the top
          const order = i * totalCols + ci; // reading-order index
          return (
            <ReelStrip
              key={i}
              target={[colArr[row]]}
              size={size}
              gap={gap}
              delayMs={0}
              durationMs={spinTime + order * stopInterval}
              pool={pool}
              tile={tile}
            />
          );
        })}
      </div>
    );
  }

  if (mode === 'flipping') {
    // Cards begin face-DOWN (blank back). They flip over one at a time in
    // reading order to reveal the symbol underneath.
    return (
      <div className="flex flex-col justify-center" style={{ gap }}>
        {Array.from({ length: rows }).map((_, i) => {
          const row = rows - 1 - i;
          const order = i * totalCols + ci;
          return (
            <FlipCard
              key={i}
              id={colArr[row]}
              size={size}
              delayMs={order * stopInterval}
              tile={tile}
            />
          );
        })}
      </div>
    );
  }

  // cascading drop — base board is empty; symbols fall in from above and are
  // CLIPPED to the board, so a tile stays invisible until it actually crosses
  // into the board area (nothing floats above the board before it drops in).
  const cellH = size + gap;
  const viewportH = rows * size + (rows - 1) * gap;
  return (
    <div
      className="flex flex-col justify-center"
      style={{ gap, height: viewportH, overflow: 'hidden' }}
    >
      {Array.from({ length: rows }).map((_, i) => {
        const row = rows - 1 - i; // i = visual position from the top
        return (
          <motion.div
            key={i}
            // start one cell above the board's top edge (hidden by overflow);
            // lower slots therefore fall further, like a real avalanche.
            initial={{ y: -(i + 1) * cellH }}
            animate={{ y: 0 }}
            transition={{ delay: (ci * stopInterval * 0.4 + i * 55) / 1000, type: 'spring', stiffness: 420, damping: 22 }}
          >
            {tile(colArr[row])}
          </motion.div>
        );
      })}
    </div>
  );
}

/* ----------------------- a single flip card (back → symbol) --------------- */

interface FlipCardProps {
  id: string;
  size: number;
  delayMs: number;
  tile: (id: string, win?: boolean) => ReactNode;
}

function FlipCard({ id, size, delayMs, tile }: FlipCardProps) {
  return (
    <div style={{ perspective: 600, width: size, height: size }}>
      <motion.div
        style={{ position: 'relative', width: size, height: size, transformStyle: 'preserve-3d' }}
        initial={{ rotateY: 0 }}
        animate={{ rotateY: 180 }}
        transition={{ delay: delayMs / 1000, duration: 0.42, ease: 'easeInOut' }}
      >
        {/* face-down back (blank) — visible before the flip */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            fontSize: size * 0.42,
          }}
          className="flex items-center justify-center rounded-lg bg-gradient-to-br from-slate-600 to-slate-800 text-slate-400 shadow-md ring-2 ring-inset ring-slate-500/60"
        >
          ◇
        </div>
        {/* symbol face — pre-rotated so it reads upright once flipped in */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            transform: 'rotateY(180deg)',
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
          }}
        >
          {tile(id)}
        </div>
      </motion.div>
    </div>
  );
}

/* ------------------- a single vertically-scrolling reel strip ------------- */

interface ReelStripProps {
  target: string[]; // bottom→top board order for this reel (row 0 = bottom)
  size: number;
  gap: number;
  delayMs: number;
  durationMs: number;
  pool: string[];
  tile: (id: string, win?: boolean) => ReactNode;
}

function ReelStrip({ target, size, gap, delayMs, durationMs, pool, tile }: ReelStripProps) {
  const cellH = size + gap;
  const rows = target.length;
  // long blur-by filler that scrolls past below the result
  const tailFiller = useMemo(
    () => Array.from({ length: FILLER }, () => pool[Math.floor(Math.random() * pool.length)]),
    // fresh filler each mount (= each spin)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  // a couple of filler kept ABOVE the result, so the downward bounce overshoot
  // never opens a gap that would expose the board sitting behind the reel.
  const headFiller = useMemo(
    () => Array.from({ length: HEAD }, () => pool[Math.floor(Math.random() * pool.length)]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  // strip top→bottom: head filler, the result (highest row first), tail filler.
  // The strip starts shifted up (showing filler) and slides DOWN to land on the
  // result — a real downward-spinning reel.
  const tiles = useMemo(
    () => [...headFiller, ...[...target].reverse(), ...tailFiller],
    [headFiller, tailFiller, target],
  );
  const rest = -(HEAD * cellH); // result block sits exactly in the viewport
  const start = rest - FILLER * cellH; // begin up high, showing the tail filler
  const viewportH = rows * size + (rows - 1) * gap;

  return (
    <div style={{ height: viewportH, width: size, overflow: 'hidden' }}>
      <motion.div
        style={{ display: 'flex', flexDirection: 'column', gap }}
        initial={{ y: start }}
        animate={{
          y: [start, rest, rest + size * 0.12, rest],
          filter: ['blur(2px)', 'blur(2px)', 'blur(0.5px)', 'blur(0px)'],
        }}
        transition={{
          delay: delayMs / 1000,
          duration: durationMs / 1000,
          times: [0, 0.82, 0.92, 1],
          ease: 'easeOut',
        }}
      >
        {tiles.map((id, i) => (
          <div key={i}>{tile(id)}</div>
        ))}
      </motion.div>
    </div>
  );
}
