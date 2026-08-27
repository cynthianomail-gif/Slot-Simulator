import { useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Upload, X } from 'lucide-react';

/** Longest edge (px) an uploaded picture is scaled down to before it is stored. */
const MAX_EDGE = 256;

/**
 * Read a local file and return it as a data: URI, downscaled to MAX_EDGE so a
 * 2 MB screenshot doesn't bloat the config (and the exported JSON with it).
 * PNG is kept as the output format so transparent symbol art stays transparent.
 */
async function fileToDataUrl(file: File): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(fr.error ?? new Error('read failed'));
    fr.readAsDataURL(file);
  });

  // SVG has no useful intrinsic size to rescale by — keep the original.
  if (file.type === 'image/svg+xml') return raw;

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('decode failed'));
    el.src = raw;
  });

  const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
  if (scale === 1 && raw.length < 120_000) return raw;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return raw;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

interface ImagePickerProps {
  value: string | undefined;
  onChange: (next: string | undefined) => void;
}

/**
 * Symbol picture input: paste a URL, or upload a local image file (stored
 * inline as a data: URI so it survives without any hosting).
 */
export function ImagePicker({ value, onChange }: ImagePickerProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const uploaded = !!value && value.startsWith('data:');
  const sizeKb = uploaded ? Math.max(1, Math.round((value as string).length / 1024)) : 0;

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      onChange(await fileToDataUrl(file));
    } catch {
      setErr('這個檔案讀不進來，請換一張 PNG / JPG。');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = ''; // allow re-picking the same file
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        {uploaded ? (
          <div className="flex h-8 flex-1 items-center rounded-md border border-border bg-secondary/40 px-2 text-[11px] text-muted-foreground">
            已上傳圖片（約 {sizeKb} KB）
          </div>
        ) : (
          <Input
            className="h-8 flex-1"
            placeholder="https://.../symbol.png"
            defaultValue={value ?? ''}
            onBlur={(e) => onChange(e.target.value.trim() || undefined)}
          />
        )}
        <Button
          size="sm"
          variant="secondary"
          className="h-8 shrink-0 px-2"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="h-3.5 w-3.5" /> {busy ? '處理中' : '上傳'}
        </Button>
        {value && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 shrink-0 px-2"
            title="清除圖片"
            onClick={() => onChange(undefined)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void pick(e.target.files?.[0])}
      />
      {err && <div className="text-[10px] leading-tight text-destructive">{err}</div>}
    </div>
  );
}
