import { useGameStore } from '@/store/gameStore';
import { NumField, Field, Section, parseNums } from './fields';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { regularShape } from '@/engine/grid';
import { Plus, X } from 'lucide-react';
import type { PayMode } from '@/types';

export function GeneralEditor() {
  const config = useGameStore((s) => s.config);
  const update = useGameStore((s) => s.updateConfig);
  const mode = config.pay.mode;

  return (
    <div className="space-y-4">
      <Section title="數學模型" desc="目標數據（結果以符號權重計算）">
        <div className="grid grid-cols-2 gap-3">
          <NumField
            label="目標 RTP"
            hint="0 ~ 1（例 0.985）"
            value={config.math.targetRTP}
            step={0.005}
            onChange={(v) => update((c) => { c.math.targetRTP = v; })}
          />
          <NumField
            label="目標 BF"
            hint="N 局觸發 1 次"
            value={config.math.targetBF}
            onChange={(v) => update((c) => { c.math.targetBF = v; })}
          />
        </div>
      </Section>

      <Section title="盤面" desc="輪數（直行）與每輪列數">
        <div className="grid grid-cols-2 gap-3">
          <NumField
            label="輪數（直行）"
            value={config.grid.cols}
            min={1}
            onChange={(v) => update((c) => {
              const cols = Math.max(1, Math.floor(v));
              const rows = c.grid.shape[0] ?? 3;
              c.grid.cols = cols;
              c.grid.shape = regularShape(cols, rows);
              while (c.reels.strips.length < cols) c.reels.strips.push([...(c.reels.strips[0] ?? [])]);
              c.reels.strips.length = cols;
            })}
          />
          <NumField
            label="列數（規則盤面）"
            value={config.grid.shape[0] ?? 3}
            min={1}
            onChange={(v) => update((c) => {
              c.grid.shape = regularShape(c.grid.cols, Math.max(1, Math.floor(v)));
            })}
          />
        </div>
        <Field label="不規則盤面" hint="每輪列數，以逗號分隔（例 3,3,4,3,3）">
          <Input
            defaultValue={config.grid.shape.join(', ')}
            onBlur={(e) => update((c) => {
              const shape = parseNums(e.target.value).map((n) => Math.max(1, Math.floor(n)));
              if (shape.length) {
                c.grid.shape = shape;
                c.grid.cols = shape.length;
                while (c.reels.strips.length < shape.length) c.reels.strips.push([...(c.reels.strips[0] ?? [])]);
                c.reels.strips.length = shape.length;
              }
            })}
          />
        </Field>
      </Section>

      <Section title="得分" desc="連線方式與賠付規則">
        <Field label="連線方式">
          <Select
            value={mode}
            options={['payline', 'ways', 'cluster']}
            labels={{ payline: '線數 (payline)', ways: '路數 (ways)', cluster: '群集 (cluster)' }}
            onChange={(v) => update((c) => { c.pay.mode = v as PayMode; })}
          />
        </Field>

        {mode === 'cluster' ? (
          <NumField
            label="群集最小數"
            hint="相連的同符號至少幾個才賠付"
            value={config.pay.clusterMin ?? 8}
            onChange={(v) => update((c) => { c.pay.clusterMin = v; })}
          />
        ) : (
          <NumField
            label="最小連線數"
            hint="連續幾個相同符號開始賠付（通常 3）"
            value={config.pay.minMatch}
            onChange={(v) => update((c) => { c.pay.minMatch = v; })}
          />
        )}

        {mode === 'payline' && <PaylineEditor />}
      </Section>
    </div>
  );
}

/* ------------------------------ payline editor ------------------------------ */

function PaylineEditor() {
  const config = useGameStore((s) => s.config);
  const update = useGameStore((s) => s.updateConfig);
  const cols = config.grid.cols;
  const lines = config.pay.paylines ?? [];

  const setLine = (idx: number, raw: string) => update((c) => {
    const rows = parseNums(raw).map((n) => Math.max(0, Math.floor(n)));
    const list = (c.pay.paylines ??= []);
    if (list[idx]) list[idx] = { ...list[idx], rows };
  });

  const addLine = () => update((c) => {
    const list = (c.pay.paylines ??= []);
    const id = list.reduce((m, l) => Math.max(m, l.id), 0) + 1;
    list.push({ id, rows: Array.from({ length: c.grid.cols }, () => 0) });
  });

  const removeLine = (idx: number) => update((c) => {
    c.pay.paylines?.splice(idx, 1);
  });

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/20 p-2.5">
      <div className="flex items-center justify-between">
        <div className="text-[13px] font-medium text-foreground">
          得分線（共 {lines.length} 線）
        </div>
        <Button size="sm" variant="secondary" className="h-7 px-2" onClick={addLine}>
          <Plus className="h-3.5 w-3.5" /> 新增線
        </Button>
      </div>

      {lines.length === 0 && (
        <div className="py-2 text-center text-[11px] text-muted-foreground">
          尚無得分線，點「新增線」開始
        </div>
      )}

      <div className="space-y-1.5">
        {lines.map((l, i) => {
          const lenOk = l.rows.length === cols;
          return (
            <div key={l.id} className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-[11px] tabular-nums text-muted-foreground">
                第 {i + 1} 線
              </span>
              <Input
                className={lenOk ? '' : 'border-amber-500/70'}
                defaultValue={l.rows.join(', ')}
                onBlur={(e) => setLine(i, e.target.value)}
              />
              <button
                onClick={() => removeLine(i)}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                title="刪除此線"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] leading-snug text-muted-foreground">
        每欄填一個列號，以逗號分隔，數量需等於輪數（目前 {cols} 輪）。
        由上往下數，0＝最上列。例：{Array.from({ length: cols }, () => '0').join(',')} 為最上面一橫排。
      </p>
    </div>
  );
}

/* --------------------------------- helpers --------------------------------- */

export function Select({
  value,
  options,
  onChange,
  labels,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  labels?: Record<string, string>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      {options.map((o) => (
        <option key={o} value={o}>{labels?.[o] ?? o}</option>
      ))}
    </select>
  );
}
