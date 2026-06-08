import { useGameStore } from '@/store/gameStore';
import { NumField, TextField, Field, parseNums } from './fields';
import { Input } from '@/components/ui/input';
import { regularShape } from '@/engine/grid';
import type { MathMode, PayMode } from '@/types';

export function GeneralEditor() {
  const config = useGameStore((s) => s.config);
  const update = useGameStore((s) => s.updateConfig);

  return (
    <div className="space-y-4">
      <Section title="玩家 / 錢包">
        <TextField label="玩家名稱" value={config.user.name} onChange={(v) => update((c) => { c.user.name = v; })} />
        <NumField label="餘額" value={config.user.balance} step={1000} onChange={(v) => update((c) => { c.user.balance = v; })} />
      </Section>

      <Section title="押注">
        <NumField label="預設押注" value={config.bet.default} onChange={(v) => update((c) => { c.bet.default = v; })} />
        <Field label="押注級距（以逗號分隔）">
          <Input
            defaultValue={config.bet.steps.join(', ')}
            onBlur={(e) => update((c) => { c.bet.steps = parseNums(e.target.value); })}
          />
        </Field>
      </Section>

      <Section title="數學">
        <Field label="數學模式">
          <Select
            value={config.math.mode}
            options={['reelstrip', 'weight']}
            labels={{ reelstrip: '滾輪帶 (reelstrip)', weight: '權重 (weight)' }}
            onChange={(v) => update((c) => { c.math.mode = v as MathMode; })}
          />
        </Field>
        <NumField label="目標 RTP（0-1）" value={config.math.targetRTP} step={0.01} onChange={(v) => update((c) => { c.math.targetRTP = v; })} />
        <NumField label="目標 BF（N 局 1 次）" value={config.math.targetBF} onChange={(v) => update((c) => { c.math.targetBF = v; })} />
      </Section>

      <Section title="盤面">
        <div className="grid grid-cols-2 gap-2">
          <NumField label="軸數（直行）" value={config.grid.cols} min={1} onChange={(v) => update((c) => {
            const cols = Math.max(1, Math.floor(v));
            const rows = c.grid.shape[0] ?? 3;
            c.grid.cols = cols;
            c.grid.shape = regularShape(cols, rows);
            // keep reel strips array length in sync
            while (c.reels.strips.length < cols) c.reels.strips.push([...(c.reels.strips[0] ?? [])]);
            c.reels.strips.length = cols;
          })} />
          <NumField label="行數（規則盤面）" value={config.grid.shape[0] ?? 3} min={1} onChange={(v) => update((c) => {
            c.grid.shape = regularShape(c.grid.cols, Math.max(1, Math.floor(v)));
          })} />
        </div>
        <Field label="不規則盤面（每軸行數，以逗號分隔）">
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

      <Section title="派彩">
        <Field label="派彩模式">
          <Select
            value={config.pay.mode}
            options={['payline', 'ways', 'cluster']}
            labels={{ payline: '線數 (payline)', ways: '路數 (ways)', cluster: '群集 (cluster)' }}
            onChange={(v) => update((c) => { c.pay.mode = v as PayMode; })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <NumField label="最小連線數" value={config.pay.minMatch} onChange={(v) => update((c) => { c.pay.minMatch = v; })} />
          <NumField label="群集最小數" value={config.pay.clusterMin ?? 8} onChange={(v) => update((c) => { c.pay.clusterMin = v; })} />
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-primary">{title}</div>
      {children}
    </div>
  );
}

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
