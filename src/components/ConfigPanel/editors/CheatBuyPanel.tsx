import { useGameStore } from '@/store/gameStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/misc';
import { Section } from './fields';

/**
 * 強開 — force-open. Lists the user's own triggers (defined in the 機制 tab);
 * arming one forces the next spin to roll a board that satisfies that trigger,
 * so the mechanic actually fires and plays out.
 */
export function CheatBuyPanel() {
  const triggers = useGameStore((s) => s.config.triggers);
  const features = useGameStore((s) => s.config.features);
  const armed = useGameStore((s) => s.cheats.armedTriggers);
  const armTrigger = useGameStore((s) => s.armTrigger);
  const clearCheats = useGameStore((s) => s.clearCheats);

  const condText = (tid: string) => {
    const t = triggers.find((x) => x.id === tid);
    const c = t?.rule.conditions?.[0];
    return c?.symbolId ? `${c.symbolId} ${c.comparator} ${c.value}` : '';
  };

  return (
    <div className="space-y-4">
      <Section
        title="強開機制"
        desc="裝填後下一旋轉強制轉出可觸發該機制的盤面"
        action={
          armed.length > 0 ? (
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={clearCheats}>清除</Button>
          ) : undefined
        }
      >
        {triggers.length === 0 && (
          <div className="py-2 text-center text-[11px] text-muted-foreground">
            尚無機制，請先到「機制」分頁新增觸發條件
          </div>
        )}
        <div className="grid grid-cols-1 gap-2">
          {triggers.map((t) => {
            const feat = features.find((f) => f.id === t.target);
            const on = armed.includes(t.id);
            return (
              <button
                key={t.id}
                onClick={() => armTrigger(t.id)}
                className={`rounded-md border px-2.5 py-2 text-left transition-colors ${
                  on
                    ? 'border-accent/50 bg-accent/15'
                    : 'border-border bg-background/40 hover:border-primary/40'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">{t.name}</span>
                  {on && <Badge variant="accent">已裝填</Badge>}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {condText(t.id) && <span>{condText(t.id)} · </span>}
                  → {feat?.type ?? t.target}
                </div>
              </button>
            );
          })}
        </div>
      </Section>
    </div>
  );
}
