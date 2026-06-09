import { AnimatePresence, motion } from 'framer-motion';
import { useGameStore } from '@/store/gameStore';
import { fmt } from '@/lib/utils';

/**
 * Settlement panel — only shown at the end of a feature round (e.g. after all
 * FG spins finish). Normal / cascade rounds use the in-board stepWin instead.
 */
export function FloatingWin() {
  const roundWin = useGameStore((s) => s.roundWin);
  const spinning = useGameStore((s) => s.spinning);
  const bet = useGameStore((s) => s.bet);
  const animationEnabled = useGameStore((s) => s.animationEnabled);
  const lastRound = useGameStore((s) => s.lastRound);

  const hadFeature = (lastRound?.triggeredFeatures?.length ?? 0) > 0;
  const show = !spinning && roundWin > 0 && hadFeature;
  const x = bet > 0 ? roundWin / bet : 0;
  const tier = x >= 50 ? 'MEGA WIN' : x >= 20 ? 'BIG WIN' : x >= 5 ? 'NICE WIN' : 'WIN';

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key={roundWin}
          initial={animationEnabled ? { scale: 0.3, opacity: 0 } : false}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 1.2, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 18 }}
          className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center"
        >
          <div className="text-sm font-bold uppercase tracking-[0.3em] text-accent drop-shadow">
            {tier}
          </div>
          <div className="bg-gradient-to-b from-amber-200 to-amber-500 bg-clip-text text-6xl font-black tabular-nums text-transparent drop-shadow-lg">
            {fmt(roundWin)}
          </div>
          <div className="text-xs font-semibold text-muted-foreground">{x.toFixed(2)}× bet</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
