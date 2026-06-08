import { useGameStore } from '@/store/gameStore';
import { Switch } from '@/components/ui/misc';
import { Input, Label } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select } from './GeneralEditor';
import { NumField } from './fields';
import type { AnimationType, AnimationProfile } from '@/types';

/** RNG + Animation system controls. */
export function SystemEditor() {
  const s = useGameStore();
  const update = s.updateConfig;

  return (
    <div className="space-y-5">
      {/* RNG */}
      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-primary">亂數產生器</div>
        <Switch
          checked={s.useFixedSeed}
          onCheckedChange={(v) => s.setSeedMode(v, s.seed)}
          label="固定種子模式"
        />
        {s.useFixedSeed && (
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label>種子</Label>
              <Input type="number" defaultValue={s.seed} onBlur={(e) => s.setSeedMode(true, parseInt(e.target.value, 10))} />
            </div>
            <Button size="sm" variant="secondary" onClick={() => s.setSeedMode(true, s.seed)}>重新設種</Button>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          相同種子可逐位元重現完全一致的旋轉序列。
        </p>
      </div>

      {/* Animation */}
      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-primary">動畫</div>
        <Switch checked={s.animationEnabled} onCheckedChange={s.toggleAnimation} label="啟用動畫" />
        <div>
          <Label>動畫類型</Label>
          <Select
            value={s.config.animation.type}
            options={['rolling', 'independent', 'cascading', 'flipping']}
            labels={{ rolling: '滾動 (rolling)', independent: '單格 (single)', cascading: '消除 (cascading)', flipping: '翻轉 (flipping)' }}
            onChange={(v) => update((c) => { c.animation.type = v as AnimationType; })}
          />
        </div>

        <ProfileEditor title="一般參數" which="normal" />
        <ProfileEditor title="極速參數" which="turbo" />
      </div>
    </div>
  );
}

function ProfileEditor({ title, which }: { title: string; which: 'normal' | 'turbo' }) {
  const profile = useGameStore((s) => s.config.animation[which]);
  const update = useGameStore((s) => s.updateConfig);
  const set = (k: keyof AnimationProfile, v: number) =>
    update((c) => { (c.animation[which][k] as number) = v; });

  return (
    <div className="rounded-md border border-border p-2 space-y-2">
      <div className="text-[11px] font-semibold text-muted-foreground">{title}</div>
      <div className="grid grid-cols-2 gap-2">
        <SecField label="總旋轉時間" ms={profile.totalSpinTime} onChange={(v) => set('totalSpinTime', v)} />
        <NumField label="旋轉速度倍率" value={profile.spinSpeed} step={0.1} onChange={(v) => set('spinSpeed', v)} />
        <SecField label="每軸停止間隔" ms={profile.stopInterval} onChange={(v) => set('stopInterval', v)} />
        <SecField label="回彈時間" ms={profile.bounceDuration} onChange={(v) => set('bounceDuration', v)} />
      </div>
    </div>
  );
}

/** Edits a millisecond value but displays/accepts seconds (1 dp). */
function SecField({ label, ms, onChange }: { label: string; ms: number; onChange: (ms: number) => void }) {
  return (
    <NumField
      label={`${label}（秒）`}
      value={Math.round(ms) / 1000}
      step={0.05}
      min={0}
      onChange={(sec) => onChange(Math.round((Number.isFinite(sec) ? sec : 0) * 1000))}
    />
  );
}
