import { useGameStore } from '@/store/gameStore';
import { Switch } from '@/components/ui/misc';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select } from './GeneralEditor';
import { NumField, Section, ItemCard, Mini, Field } from './fields';
import type { AnimationType, AnimationProfile } from '@/types';

/** RNG + Animation system controls. */
export function SystemEditor() {
  const s = useGameStore();
  const update = s.updateConfig;

  return (
    <div className="space-y-4">
      <Section title="亂數產生器" desc="固定種子可逐位元重現完全一致的旋轉序列">
        <Switch
          checked={s.useFixedSeed}
          onCheckedChange={(v) => s.setSeedMode(v, s.seed)}
          label="固定種子模式"
        />
        {s.useFixedSeed && (
          <div className="flex items-end gap-2">
            <Mini label="種子" className="flex-1">
              <Input type="number" defaultValue={s.seed} onBlur={(e) => s.setSeedMode(true, parseInt(e.target.value, 10))} />
            </Mini>
            <Button size="sm" variant="secondary" onClick={() => s.setSeedMode(true, s.seed)}>重新設種</Button>
          </div>
        )}
      </Section>

      <Section title="動畫" desc="演出方式與速度參數（以秒為單位）">
        <Switch checked={s.animationEnabled} onCheckedChange={s.toggleAnimation} label="啟用動畫" />
        <Field label="動畫類型">
          <Select
            value={s.config.animation.type}
            options={['rolling', 'independent', 'cascading', 'flipping']}
            labels={{ rolling: '滾動 (rolling)', independent: '單格 (single)', cascading: '消除 (cascading)', flipping: '翻轉 (flipping)' }}
            onChange={(v) => update((c) => { c.animation.type = v as AnimationType; })}
          />
        </Field>

        <ProfileEditor title="一般參數" which="normal" />
        <ProfileEditor title="極速參數" which="turbo" />
      </Section>
    </div>
  );
}

function ProfileEditor({ title, which }: { title: string; which: 'normal' | 'turbo' }) {
  const profile = useGameStore((s) => s.config.animation[which]);
  const update = useGameStore((s) => s.updateConfig);
  const set = (k: keyof AnimationProfile, v: number) =>
    update((c) => { (c.animation[which][k] as number) = v; });

  return (
    <ItemCard>
      <div className="text-[12px] font-semibold text-foreground">{title}</div>
      <div className="grid grid-cols-2 gap-2">
        <SecField label="總旋轉時間" ms={profile.totalSpinTime} onChange={(v) => set('totalSpinTime', v)} />
        <NumField label="旋轉速度倍率" value={profile.spinSpeed} step={0.1} onChange={(v) => set('spinSpeed', v)} />
        <SecField label="每輪停止間隔" ms={profile.stopInterval} onChange={(v) => set('stopInterval', v)} />
        <SecField label="回彈時間" ms={profile.bounceDuration} onChange={(v) => set('bounceDuration', v)} />
      </div>
    </ItemCard>
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
