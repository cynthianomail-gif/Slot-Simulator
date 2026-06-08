import { useGameStore } from '@/store/gameStore';
import { Input, Label } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge, Switch } from '@/components/ui/misc';
import { Select } from './GeneralEditor';
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
    <div className="space-y-5">
      {/* Triggers */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wide text-primary">觸發條件</div>
          <Button size="sm" variant="secondary" onClick={() => update((c) => {
            c.triggers.push({
              id: `trg_${c.triggers.length}`,
              name: '新觸發',
              target: c.features[0]?.id ?? '',
              rule: { logic: 'AND', conditions: [{ symbolId: c.symbols[0]?.id, comparator: '>=', value: 3 }] },
            });
          })}>
            <Plus className="h-4 w-4" /> 新增
          </Button>
        </div>
        {config.triggers.map((t, i) => {
          const cond = t.rule.conditions?.[0] ?? { symbolId: '', comparator: '>=' as Comparator, value: 3 };
          return (
            <div key={i} className="rounded-md border border-border p-2 space-y-2">
              <div className="flex items-center gap-2">
                <Input className="h-7 flex-1" defaultValue={t.name} onBlur={(e) => update((c) => { c.triggers[i].name = e.target.value; })} />
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => update((c) => { c.triggers[i] && c.triggers.splice(i, 1); })}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-1">
                <div>
                  <Label>圖示</Label>
                  <Select value={cond.symbolId ?? ''} options={config.symbols.map((s) => s.id)} onChange={(v) => update((c) => { ensureCond(c.triggers[i]).symbolId = v; })} />
                </div>
                <div>
                  <Label>比較</Label>
                  <Select value={cond.comparator} options={['>=', '>', '=', '<', '<=']} onChange={(v) => update((c) => { ensureCond(c.triggers[i]).comparator = v as Comparator; })} />
                </div>
                <div>
                  <Label>數量</Label>
                  <Input className="h-8" type="number" defaultValue={cond.value} onBlur={(e) => update((c) => { ensureCond(c.triggers[i]).value = parseFloat(e.target.value); })} />
                </div>
              </div>
              <div>
                <Label>邏輯</Label>
                <div className="flex items-center gap-2">
                  <Select value={t.rule.logic} options={['AND', 'OR', 'NOT']} onChange={(v) => update((c) => { c.triggers[i].rule.logic = v as 'AND' | 'OR' | 'NOT'; })} />
                  <Label>→ 功能</Label>
                  <Select value={t.target} options={featureIds} onChange={(v) => update((c) => { c.triggers[i].target = v; })} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Features */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wide text-primary">功能</div>
          <Button size="sm" variant="secondary" onClick={() => update((c) => {
            c.features.push({ id: `feat_${c.features.length}`, type: types[0] ?? 'freeGame', enabled: true, params: {} });
          })}>
            <Plus className="h-4 w-4" /> 新增
          </Button>
        </div>
        {config.features.map((f, i) => (
          <div key={i} className="rounded-md border border-border p-2 space-y-2">
            <div className="flex items-center gap-2">
              <Input className="h-7 w-24" defaultValue={f.id} onBlur={(e) => update((c) => { c.features[i].id = e.target.value; })} />
              <div className="flex-1">
                <Select value={f.type} options={types} onChange={(v) => update((c) => { c.features[i].type = v; })} />
              </div>
              <Switch checked={f.enabled} onCheckedChange={(v) => update((c) => { c.features[i].enabled = v; })} />
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => update((c) => { c.features.splice(i, 1); })}>
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
            <div>
              <Label>參數（JSON）</Label>
              <textarea
                className="min-h-[60px] w-full rounded-md border border-input bg-background p-2 font-mono text-[11px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
            </div>
            <Badge variant="muted">{f.type}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

function ensureCond(t: { rule: { conditions?: { symbolId?: string; comparator: Comparator; value: number }[] } }) {
  if (!t.rule.conditions || t.rule.conditions.length === 0) {
    t.rule.conditions = [{ symbolId: '', comparator: '>=', value: 3 }];
  }
  return t.rule.conditions[0];
}
