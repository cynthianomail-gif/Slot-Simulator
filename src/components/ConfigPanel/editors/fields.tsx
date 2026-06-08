import { Input, Label } from '@/components/ui/input';

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function NumField({
  label,
  value,
  onChange,
  step = 1,
  min,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
}) {
  return (
    <Field label={label}>
      <Input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        step={step}
        min={min}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </Field>
  );
}

export function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label}>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

export function parseNums(s: string): number[] {
  return s
    .split(',')
    .map((x) => parseFloat(x.trim()))
    .filter((x) => Number.isFinite(x));
}

export function parseList(s: string): string[] {
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}
