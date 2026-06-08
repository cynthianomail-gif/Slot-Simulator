import { useGameStore } from '@/store/gameStore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge, Switch } from '@/components/ui/misc';
import { Select } from './GeneralEditor';
import { Section, ItemCard, Mini } from './fields';
import { registeredFeatureTypes } from '@/features/registry';
import { Plus, Trash2 } from 'lucide-react';
import type { Comparator } from '@/types';

/**
 * Trigger + Feature editor. Triggers use a simplified single-condition form
 * (symbol >= count -> feature). Features expose their params as editable JSON
 * so any plugin's parameters are tunable without bespoke UI.
 */
export function TriggerFeatureEditor() {
  const config = useGameStore((s) => s.config);
  const update = useGameStore((s) => s.updateConfig);
  const featureIds = config.features.map((f) => f.id);
  const types = registeredFeatureTypes();

  return (
    <div className="space-y-4">
      <Section
        title="觸發條件"
        desc="符合條件時啟動對應功能"
        action={
          <Button size="sm" variant="secondary" className="h-7 px-2" onClick={() => update((c) => {
            c.triggers.push({
              id: `trg_${c.triggers.length}`,
              name: '新觸發',
              target: c.features[0]?.id ?? '',
              rule: { logic: 'AND', conditions: [{ symbolId: c.symbols[0]?.id, comparator: '>=', value: 3 }] },
            });
          })}>
            <Plus className="h-3.5 w-3.5" /> 新增
          </Button>
        }
      >
        {config.triggers.length === 0 && (
          <div className="py-2 text-center text-[11px] text-muted-foreground">尚無觸發條件</div>
        )}
        {config.triggers.map((t, i) => {
          const cond = t.rule.conditions?.[0] ?? { symbolId: '', comparator: '>=' as Comparator, value: 3 };
          return (
            <ItemCard key={i}>
              <div className="flex items-center gap-2">
                <Input className="h-8 flex-1" defaultValue={t.name} onBlur={(e) => update((c) => { c.triggers[i].name = e.target.value; })} />
                <button
                  onClick={() => update((c) => { c.triggers[i] && c.triggers.splice(i, 1); })}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                  title="刪除"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Mini label="圖示">
                  <Select value={cond.symbolId ?? ''} options={config.symbols.map((s) => s.id)} onChange={(v) => update((c) => { ensureCond(c.triggers[i]).symbolId = v; })} />
                </Mini>
                <Mini label="比較">
                  <Select value={cond.comparator} options={['>=', '>', '=', '<', '<=']} onChange={(v) => update((c) => { ensureCond(c.triggers[i]).comparator = v as Comparator; })} />
                </Mini>
                <Mini label="數量">
                  <Input className="h-8" type="number" defaultValue={cond.value} onBlur={(e) => update((c) => { ensureCond(c.triggers[i]).value = parseFloat(e.target.value); })} />
                </Mini>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Mini label="邏輯">
                  <Select value={t.rule.logic} options={['AND', 'OR', 'NOT']} onChange={(v) => update((c) => { c.triggers[i].rule.logic = v as 'AND' | 'OR' | 'NOT'; })} />
                </Mini>
                <Mini label="啟動功能">
                  <Select value={t.target} options={featureIds} onChange={(v) => update((c) => { c.triggers[i].target = v; })} />
                </Mini>
              </div>
            </ItemCard>
          );
        })}
      </Section>

      <Section
        title="功能"
        desc="外掛功能與其參數"
        action={
          <Button size="sm" variant="secondary" className="h-7 px-2" onClick={() => update((c) => {
            c.features.push({ id: `feat_${c.features.length}`, type: types[0] ?? 'freeGame', enabled: true, params: {} });
          })}>
            <Plus className="h-3.5 w-3.5" /> 新增
          </Button>
        }
      >
        {config.features.length === 0 && (
          <div className="py-2 text-center text-[11px] text-muted-foreground">尚無功能</div>
        )}
        {config.features.map((f, i) => (
          <ItemCard key={i}>
            <div className="flex items-center gap-2">
              <Input className="h-8 w-24" defaultValue={f.id} onBlur={(e) => update((c) => { c.features[i].id = e.target.value; })} />
              <div className="flex-1">
                <Select value={f.type} options={types} onChange={(v) => update((c) => { c.features[i].type = v; })} />
              </div>
              <Switch checked={f.enabled} onCheckedChange={(v) => update((c) => { c.features[i].enabled = v; })} />
              <button
                onClick={() => update((c) => { c.features.splice(i, 1); })}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                title="刪除"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <Mini label="參數（JSON）">
              <textarea
                className="min-h-[60px] w-full rounded-md border border-input bg-background p-2 font-mono text-[11px] leading-relaxed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                defaultValue={JSON.stringify(f.params, null, 2)}
                onBlur={(e) => {
                  try {
                    const parsed = JSON.parse(e.target.value);
                    update((c) => { c.features[i].params = parsed; });
                    e.target.classList.remove('border-destructive');
                  } catch {
                    e.target.classList.add('border-destructive');
                  }
                }}
              />
            </Mini>
          </ItemCard>
        ))}
      </Section>
    </div>
  );
}

function ensureCond(t: { rule: { conditions?: { symbolId?: string; comparator: Comparator; value: number }[] } }) {
  if (!t.rule.conditions || t.rule.conditions.length === 0) {
    t.rule.conditions = [{ symbolId: '', comparator: '>=', value: 3 }];
  }
  return t.rule.conditions[0];
}
