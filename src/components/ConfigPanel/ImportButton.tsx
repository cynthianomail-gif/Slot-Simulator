import { useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useGameStore } from '@/store/gameStore';
import { readXlsxMatrices } from '@/lib/import/xlsxReader';
import { parseSlotPlannerMatrices } from '@/lib/import/parseWorkbook';
import { Upload, CheckCircle2, AlertTriangle, Info, Loader2 } from 'lucide-react';

interface Summary {
  ok: boolean;
  name: string;
  warnings: string[];
  info: string[];
  cols?: number;
  shape?: number[];
  symbols?: number;
  error?: string;
}

export function ImportButton() {
  const loadConfig = useGameStore((s) => s.loadConfig);
  const spinning = useGameStore((s) => s.spinning);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);

  const onPick = () => { if (!busy && !spinning) inputRef.current?.click(); };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (inputRef.current) inputRef.current.value = ''; // allow re-import of same file
    if (!file) return;
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const matrices = await readXlsxMatrices(buf);
      const baseName = file.name.replace(/\.[^.]+$/, '');
      const { config, warnings, info } = parseSlotPlannerMatrices(matrices, baseName);
      loadConfig(config);
      setSummary({
        ok: true,
        name: file.name,
        warnings,
        info,
        cols: config.grid.cols,
        shape: config.grid.shape,
        symbols: config.symbols.length,
      });
    } catch (err) {
      setSummary({
        ok: false,
        name: file.name,
        warnings: [],
        info: [],
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={onFile}
      />
      <Button
        size="sm"
        variant="ghost"
        className="text-muted-foreground"
        onClick={onPick}
        disabled={busy || spinning}
        title={spinning ? '請先等本局結束再匯入' : '匯入 SlotPlanner 設定檔 (.xlsx)'}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} 匯入設定檔
      </Button>

      <Dialog open={!!summary} onOpenChange={(o) => !o && setSummary(null)}>
        <DialogContent className="max-w-md">
          {summary?.ok ? (
            <>
              <DialogTitle className="flex items-center gap-2 text-emerald-500">
                <CheckCircle2 className="h-5 w-5" /> 匯入完成
              </DialogTitle>
              <div className="space-y-3 text-[13px]">
                <div className="text-muted-foreground">
                  <span className="font-medium text-foreground">{summary.name}</span> 已套用。
                  盤面 {summary.cols} 軸（{summary.shape?.join('×')}）、{summary.symbols} 個圖示。
                  可直接按 <span className="font-semibold text-foreground">Spin</span> 試玩；
                  要試免費遊戲可用「強開」分頁直接觸發。
                </div>

                {summary.info.length > 0 && (
                  <Group icon={<Info className="h-4 w-4 text-sky-400" />} title="對應說明" items={summary.info} tone="sky" />
                )}
                {summary.warnings.length > 0 && (
                  <Group
                    icon={<AlertTriangle className="h-4 w-4 text-amber-400" />}
                    title={`已略過 / 注意（${summary.warnings.length}）`}
                    items={summary.warnings}
                    tone="amber"
                  />
                )}
              </div>
              <div className="flex justify-end">
                <Button size="sm" onClick={() => setSummary(null)}>開始試玩</Button>
              </div>
            </>
          ) : (
            <>
              <DialogTitle className="flex items-center gap-2 text-red-500">
                <AlertTriangle className="h-5 w-5" /> 匯入失敗
              </DialogTitle>
              <div className="space-y-2 text-[13px]">
                <div className="text-muted-foreground">
                  無法解析 <span className="font-medium text-foreground">{summary?.name}</span>。
                </div>
                <pre className="whitespace-pre-wrap rounded-md bg-muted/40 p-2 text-[12px] text-red-300">
                  {summary?.error}
                </pre>
                <div className="text-[12px] text-muted-foreground">
                  請確認檔案為 .xlsx（非 .xls / .csv），且為 SlotPlanner Pro 設定檔格式。
                </div>
              </div>
              <div className="flex justify-end">
                <Button size="sm" variant="secondary" onClick={() => setSummary(null)}>關閉</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Group({
  icon,
  title,
  items,
  tone,
}: {
  icon: ReactNode;
  title: string;
  items: string[];
  tone: 'sky' | 'amber';
}) {
  const border = tone === 'amber' ? 'border-amber-500/30' : 'border-sky-500/30';
  return (
    <div className={`rounded-md border ${border} bg-muted/20 p-2.5`}>
      <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
        {icon} {title}
      </div>
      <ul className="max-h-48 space-y-1 overflow-y-auto pr-1 text-[12px] leading-snug text-muted-foreground">
        {items.map((w, i) => (
          <li key={i} className="flex gap-1.5">
            <span className="shrink-0 select-none">•</span>
            <span>{w}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
