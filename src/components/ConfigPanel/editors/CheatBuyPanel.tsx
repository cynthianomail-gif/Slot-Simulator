import { useGameStore } from '@/store/gameStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/misc';
import { Input } from '@/components/ui/input';
import { Section, Mini } from './fields';
import { fmt } from '@/lib/utils';
import type { CheatKind } from '@/engine/cheats';

const CHEATS: { kind: CheatKind; label: string }[] = [
  { kind: 'FORCE_FG', label: '強制免費遊戲' },
  { kind: 'FORCE_BG', label: '強制 Bonus 遊戲' },
  { kind: 'FORCE_BONUS', label: '強制 Bonus' },
  { kind: 'FORCE_RESPIN', label: '強制 Respin' },
  { kind: 'FORCE_SCATTER', label: '強制 Scatter' },
  { kind: 'FORCE_MAX_WIN', label: '強制最大贏分' },
];

export function CheatBuyPanel() {
  const armed = useGameStore((s) => s.cheats.armed);
  const maxWinX = useGameStore((s) => s.cheats.maxWinX);
  const armCheat = useGameStore((s) => s.armCheat);
  const clearCheats = useGameStore((s) => s.clearCheats);
  const buyOptions = useGameStore((s) => s.config.buyOptions);
  const buy = useGameStore((s) => s.buy);
  const bet = useGameStore((s) => s.bet);
  const balance = useGameStore((s) => s.balance);

  return (
    <div className="space-y-4">
      <Section
        title="開發者作弊"
        desc="裝填的作弊僅套用於下一盤"
        action={armed.length > 0 ? (
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={clearCheats}>清除</Button>
        ) : undefined}
      >
        <div className="grid grid-cols-2 gap-2">
          {CHEATS.map((c) => (
            <Button
              key={c.kind}
              size="sm"
              variant={armed.includes(c.kind) ? 'accent' : 'outline'}
              onClick={() => armCheat(c.kind)}
            >
              {c.label}
            </Button>
          ))}
        </div>
        <Mini label="最大贏分倍數（× 押注）">
          <Input type="number" defaultValue={maxWinX} onBlur={(e) => armCheat('FORCE_MAX_WIN', parseFloat(e.target.value))} />
        </Mini>
        {armed.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {armed.map((a) => <Badge key={a} variant="accent">{a}</Badge>)}
          </div>
        )}
      </Section>

      <Section title="購買功能" desc="花費押注倍數直接進入功能">
        {buyOptions.length === 0 && (
          <div className="py-2 text-center text-[11px] text-muted-foreground">尚無購買選項</div>
        )}
        {buyOptions.map((o) => {
          const cost = o.cost * bet;
          return (
            <div key={o.id} className="flex items-center justify-between rounded-md border border-border bg-background/40 p-2.5">
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">{o.name}</div>
                <div className="text-[11px] text-muted-foreground">{o.cost}× 押注 = {fmt(cost, 0)}</div>
              </div>
              <Button size="sm" variant="secondary" disabled={balance < cost} onClick={() => buy(o.id)}>
                購買
              </Button>
            </div>
          );
        })}
      </Section>
    </div>
  );
}
