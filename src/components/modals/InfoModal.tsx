import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useGameStore } from '@/store/gameStore';
import { Info } from 'lucide-react';

/** Renders GameConfig.paytableInfo (text or lightweight markdown). */
export function InfoModal() {
  const info = useGameStore((s) => s.config.paytableInfo);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Info className="h-4 w-4" /> 資訊
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogTitle>賠付表 / 資訊</DialogTitle>
        <div className="max-h-[60vh] overflow-y-auto text-sm leading-relaxed">
          {info.format === 'markdown' ? (
            <MiniMarkdown text={info.content} />
          ) : (
            <pre className="whitespace-pre-wrap font-sans">{info.content}</pre>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Tiny markdown renderer (headings, bold, lists, italics) — no deps. */
function MiniMarkdown({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        if (line.startsWith('# ')) return <h1 key={i} className="text-xl font-bold">{inline(line.slice(2))}</h1>;
        if (line.startsWith('## ')) return <h2 key={i} className="text-lg font-semibold">{inline(line.slice(3))}</h2>;
        if (line.startsWith('- ')) return <li key={i} className="ml-5 list-disc">{inline(line.slice(2))}</li>;
        if (line.trim() === '') return <div key={i} className="h-2" />;
        return <p key={i}>{inline(line)}</p>;
      })}
    </div>
  );
}

function inline(s: string): React.ReactNode {
  const parts = s.split(/(\*\*[^*]+\*\*|_[^_]+_)/g);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.startsWith('_') && p.endsWith('_')) return <em key={i} className="text-muted-foreground">{p.slice(1, -1)}</em>;
    return <span key={i}>{p}</span>;
  });
}
