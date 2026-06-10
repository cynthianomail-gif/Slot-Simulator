import { useGameStore } from '@/store/gameStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/misc';
import { fmt, fmtInt } from '@/lib/utils';
import { InfoModal } from '@/components/modals/InfoModal';
import { EventLogModal } from '@/components/modals/EventLogModal';
import { HistoryModal } from '@/components/modals/HistoryModal';
import { Gauge, Minus, Plus, Play, Square, Infinity as Inf } from 'lucide-react';

export function ControlBar() {
  const s = useGameStore();
  const betSteps = s.config.bet.steps;

  const stepBet = (dir: 1 | -1) => {
    const i = betSteps.indexOf(s.bet);
    const ni = Math.min(Math.max(i + dir, 0), betSteps.length - 1);
    s.setBet(betSteps[ni] ?? s.bet);
  };

  const autoActive = s.autoInfinite || s.autoRemaining > 0;

  return (
    <div className="flex items-center gap-3 border-t border-border bg-card/70 px-4 py-2.5">
      {/* User area */}
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary to-sky-700 text-sm font-bold text-white">
          {s.config.user.name.slice(0, 1).toUpperCase()}
        </div>
        <div className="leading-tight">
          <div className="text-xs font-medium">{s.config.user.name}</div>
          <div className="text-[11px] text-muted-foreground tabular-nums">
            ${fmtInt(s.balance)}
          </div>
        </div>
      </div>

      <div className="h-8 w-px bg-border" />

      {/* Bet area */}
      <div className="flex items-center gap-1">
        <div className="text-[10px] uppercase text-muted-foreground">押注</div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => stepBet(-1)} disabled={s.spinning}>
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <div className="w-16 text-center text-sm font-semibold tabular-nums">{fmt(s.bet, 0)}</div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => stepBet(1)} disabled={s.spinning}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="h-8 w-px bg-border" />

      {/* Win area */}
      <div className="min-w-[140px]">
        <div className="text-[10px] uppercase text-muted-foreground">本局總贏分</div>
        <div className="text-lg font-bold tabular-nums text-emerald-400">{fmt(s.roundWin)}</div>
      </div>

      <div className="flex-1" />

      {/* Button group */}
      <div className="flex items-center gap-2">
        <InfoModal />
        <HistoryModal />
        <EventLogModal />

        {/* Speed toggle */}
        <Button
          variant={s.speed === 'turbo' ? 'accent' : 'outline'}
          size="sm"
          onClick={() => s.setSpeed(s.speed === 'turbo' ? 'normal' : 'turbo')}
        >
          <Gauge className="h-4 w-4" /> {s.speed === 'turbo' ? '極速' : '一般'}
        </Button>

        {/* Auto spin */}
        <div className="flex items-center gap-1">
          {([10, 50, 100] as const).map((n) => (
            <Button
              key={n}
              variant="secondary"
              size="sm"
              className="px-2"
              disabled={s.spinning && !autoActive}
              onClick={() => s.startAuto(n)}
            >
              {n}
            </Button>
          ))}
          <Button variant="secondary" size="icon" className="h-8 w-8" onClick={() => s.startAuto('inf')}>
            <Inf className="h-4 w-4" />
          </Button>
          {autoActive && (
            <Button variant="destructive" size="sm" onClick={s.stopAuto}>
              停止自動 {s.autoInfinite ? '∞' : `(${s.autoRemaining})`}
            </Button>
          )}
        </div>

        {/* Spin */}
        <Button
          variant={s.spinning ? 'destructive' : 'default'}
          size="lg"
          className="min-w-[110px]"
          onClick={s.spin}
          disabled={!s.spinning && s.balance < s.bet}
        >
          {s.spinning ? (
            <>
              <Square className="h-4 w-4" /> 停止
            </>
          ) : (
            <>
              <Play className="h-4 w-4" /> 旋轉
            </>
          )}
        </Button>
      </div>

      {(s.cheats.armedTriggers.length > 0 || s.cheats.forceMaxWin) && (
        <Badge variant="accent" className="absolute -top-5 right-4">
          強開中{s.cheats.armedTriggers.length > 0 ? `：${s.cheats.armedTriggers.join(', ')}` : ''}
          {s.cheats.forceMaxWin ? ' · 最大贏分' : ''}
        </Badge>
      )}
    </div>
  );
}
