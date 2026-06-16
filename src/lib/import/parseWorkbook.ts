import type {
  GameConfig,
  SymbolDefinition,
  SymbolType,
  PaylineDef,
  PayMode,
  TriggerDef,
  FeatureConfigEntry,
  MathTarget,
} from '@/types';

/**
 * SlotPlanner Pro (.xlsx「設定檔」) → GameConfig 轉換器。
 *
 * 純函式：輸入是「每個分頁的字串矩陣」(由 xlsxReader 產生)，輸出是一份
 * GameConfig 加上 warnings(無法支援/已略過) 與 info(對應決策說明)。把解析邏輯
 * 與 .xlsx 二進位讀取分離，讓這段可以單元測試。
 *
 * 對應策略見 D:\claude\滾輪模擬器 的匯入規劃；忠實匯入（不塞示範數值），
 * 權重採「每軸 × 每模式」(config.reelWeights)。
 */

export type SheetMatrices = Record<string, string[][]>;

export interface ImportResult {
  config: GameConfig;
  /** 無法支援或已略過的項目（給使用者看的繁中說明）。 */
  warnings: string[];
  /** 對應決策說明（成功對應了什麼、做了哪些判斷）。 */
  info: string[];
}

/* ------------------------------ small helpers ----------------------------- */

const truthy = (v: string | undefined): boolean =>
  ['true', '1', 'yes', 'y', 't', 'on'].includes((v ?? '').trim().toLowerCase());

function numOr(v: string | undefined, dflt: number): number {
  if (v == null) return dflt;
  const n = parseFloat(String(v).replace(/[, ]/g, ''));
  return Number.isFinite(n) ? n : dflt;
}

/** Find a sheet by a loose key (matches the part after an `NN_` prefix, or any
 *  case-insensitive substring). Tolerant to exact-name drift across exports. */
function getSheet(m: SheetMatrices, key: string): string[][] {
  const want = key.toLowerCase();
  for (const name of Object.keys(m)) {
    const norm = name.toLowerCase().replace(/^\d+[_\s-]*/, '');
    if (norm === want || name.toLowerCase().includes(want)) return m[name];
  }
  return [];
}

/** Turn a matrix into header-keyed records (first non-empty row = header). */
function records(sheet: string[][]): Record<string, string>[] {
  const headerIdx = sheet.findIndex((r) => r.some((c) => (c ?? '').trim() !== ''));
  if (headerIdx < 0) return [];
  const headers = sheet[headerIdx].map((h) => (h ?? '').trim());
  const out: Record<string, string>[] = [];
  for (let i = headerIdx + 1; i < sheet.length; i++) {
    const row = sheet[i];
    if (!row || row.every((c) => (c ?? '').trim() === '')) continue;
    const rec: Record<string, string> = {};
    headers.forEach((h, ci) => {
      if (h) rec[h] = (row[ci] ?? '').trim();
    });
    out.push(rec);
  }
  return out;
}

/** Case-insensitive field lookup within a record. */
function field(rec: Record<string, string>, ...names: string[]): string {
  for (const n of names) {
    if (rec[n] != null) return rec[n];
    const hit = Object.keys(rec).find((k) => k.toLowerCase() === n.toLowerCase());
    if (hit) return rec[hit];
  }
  return '';
}

/* ------------------------------- main parse ------------------------------- */

export function parseSlotPlannerMatrices(
  m: SheetMatrices,
  sourceName = 'SlotPlanner 匯入',
): ImportResult {
  const warnings: string[] = [];
  const info: string[] = [];

  /* ---- 01_Global ---- */
  const globalRecs = records(getSheet(m, 'global'));
  const G: Record<string, string> = {};
  for (const r of globalRecs) {
    const k = field(r, 'Key').trim();
    if (k) G[k.toLowerCase()] = field(r, 'Value').trim();
  }

  const payTypeRaw = (G['pay_type'] || 'LINE').toUpperCase();
  const payMode: PayMode =
    payTypeRaw.startsWith('WAY') ? 'ways'
    : payTypeRaw.startsWith('CLUSTER') ? 'cluster'
    : payTypeRaw.startsWith('ANY') || payTypeRaw.startsWith('SCATTER') ? 'anywhere'
    : 'payline';
  const clusterMin = Math.max(2, Math.round(numOr(G['cluster_min_size'], 5)));

  if (truthy(G['megaways'])) {
    warnings.push('01_Global megaways=True：本模擬器為固定盤面，05_Grid_Size_Weights（變盤權重）已略過。');
  }
  if ((G['starting_mode'] || 'NG').toUpperCase() !== 'NG') {
    info.push(`01_Global starting_mode=${G['starting_mode']}：模擬器一律從 NG 起手，僅作參考。`);
  }
  if (G['random_seed']) {
    info.push(`01_Global random_seed=${G['random_seed']}：如需重現結果，請於右側「種子」開啟固定種子並填入。`);
  }

  /* ---- 02_Layout → grid.shape (placed by Reel_ID, not row order) ---- */
  const layoutRecs = records(getSheet(m, 'layout'));
  const shapeByReel: number[] = [];
  let hasSubReel = false;
  layoutRecs.forEach((r, i) => {
    const reelId = Math.round(numOr(field(r, 'Reel_ID', 'Reel'), i + 1));
    const rows = Math.max(1, Math.round(numOr(field(r, 'Max_Rows', 'Rows'), 3)));
    if (reelId >= 1) shapeByReel[reelId - 1] = rows;
    if (truthy(field(r, 'Has_SubReel'))) hasSubReel = true;
  });
  const shape: number[] = [];
  for (let i = 0; i < shapeByReel.length; i++) shape.push(shapeByReel[i] ?? 3);
  if (hasSubReel) warnings.push('02_Layout 含 SubReel 子軸：本模擬器不支援子軸，已忽略。');

  /* ---- 03_Symbols ---- */
  const symbolRecs = records(getSheet(m, 'symbols'));
  const payHeaders = collectPayHeaders(getSheet(m, 'symbols'));
  const minMatch = payHeaders.length ? payHeaders[0].count : (payMode === 'cluster' || payMode === 'anywhere' ? clusterMin : 3);
  const maxMatch = payHeaders.length ? payHeaders[payHeaders.length - 1].count : minMatch + 2;

  const cols = shape.length || maxReelId(getSheet(m, 'reel_weights')) || 5;
  while (shape.length < cols) shape.push(shape[shape.length - 1] ?? 3);

  const symbols: SymbolDefinition[] = [];
  const symbolCaps: { symbolId: string; max: number; modes?: string[] }[] = [];
  const capNotes: string[] = [];
  for (const r of symbolRecs) {
    const id = field(r, 'Symbol_ID', 'ID').trim();
    if (!id) continue;
    const name = field(r, 'Display_Name', 'Name').trim() || id;
    const isWild = truthy(field(r, 'Is_Wild'));
    const isScatter = truthy(field(r, 'Is_Scatter'));
    const type: SymbolType[] = isWild ? ['wild'] : isScatter ? ['scatter'] : ['normal'];

    const payout = payHeaders.map((p) => numOr(field(r, p.header), 0));

    const weight = numOr(field(r, 'Weight'), 1);

    // Reel_Limit: "true,true,true,..." → reels (1-indexed) where false are excluded.
    const reelLimit = field(r, 'Reel_Limit');
    const excludeFromLimit: number[] = [];
    if (reelLimit) {
      reelLimit.split(/[,，]/).forEach((tok, i) => {
        if (tok.trim() !== '' && !truthy(tok)) excludeFromLimit.push(i + 1);
      });
    }

    const maxCount = numOr(field(r, 'Max_Count'), 0);
    if (truthy(field(r, 'Use_Max')) && maxCount > 0) {
      symbolCaps.push({ symbolId: id, max: maxCount });
      capNotes.push(`${id}≤${maxCount}`);
    }

    symbols.push({
      id,
      name,
      type,
      weight,
      payout,
      ...(excludeFromLimit.length ? { excludeReels: excludeFromLimit } : {}),
    });
  }
  if (!symbols.length) warnings.push('03_Symbols 找不到任何圖示，匯入可能不完整。');

  const symById = new Map(symbols.map((s) => [s.id, s]));

  /* ---- 07_Constraints → excludeReels / 警告 ---- */
  for (const r of records(getSheet(m, 'constraints'))) {
    const type = field(r, 'Type').toUpperCase();
    const symId = field(r, 'Symbol_ID', 'Symbol').trim();
    if (type === 'REEL_RESTRICT') {
      const allowed = new Set(
        field(r, 'Reels_Allowed')
          .split(/[,，]/)
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => Number.isFinite(n)),
      );
      const sym = symById.get(symId);
      if (sym && allowed.size) {
        const excl = new Set(sym.excludeReels ?? []);
        for (let reel = 1; reel <= cols; reel++) if (!allowed.has(reel)) excl.add(reel);
        sym.excludeReels = [...excl].sort((a, b) => a - b);
        info.push(`07_Constraints：${symId} 限定於第 ${[...allowed].sort((a, b) => a - b).join(',')} 軸。`);
      }
    } else if (type === 'GLOBAL_MAX') {
      const max = Math.round(numOr(field(r, 'Max_Count_Global', 'Max_Count'), -1));
      const scope = (field(r, 'Mode_Scope', 'Scope') || 'ALL').trim().toUpperCase();
      if (symById.has(symId) && max >= 0) {
        symbolCaps.push({ symbolId: symId, max, ...(scope && scope !== 'ALL' ? { modes: [scope] } : {}) });
        capNotes.push(`${symId}≤${max}${scope && scope !== 'ALL' ? `(${scope})` : ''}`);
      }
    } else if (type === 'GLOBAL_MIN') {
      warnings.push(`07_Constraints GLOBAL_MIN（${symId || '全域'}）最少數量限制無引擎機制，已略過。`);
    }
  }
  if (capNotes.length) info.push(`圖示數量上限已套用（盤面最多）：${capNotes.join('、')}。`);

  /* ---- 04_Reel_Weights → reelWeights[mode][col][symbolId] ---- */
  const reelWeights: Record<string, Record<number, Record<string, number>>> = {};
  const modesSeen = new Set<string>();
  for (const r of records(getSheet(m, 'reel_weights'))) {
    const mode = (field(r, 'Mode_Scope', 'Mode') || 'NG').trim().toUpperCase();
    const reelId = parseInt(field(r, 'Reel_ID', 'Reel'), 10);
    const symId = field(r, 'Symbol_ID', 'Symbol').trim();
    const wt = numOr(field(r, 'Weight'), NaN);
    if (!Number.isFinite(reelId) || !symId || !Number.isFinite(wt)) continue;
    if (!symById.has(symId)) continue;
    modesSeen.add(mode);
    ((reelWeights[mode] ??= {})[reelId - 1] ??= {})[symId] = wt;
  }
  const hasReelWeights = Object.keys(reelWeights).length > 0;
  if (hasReelWeights) {
    info.push(`04_Reel_Weights：套用每軸 × 每模式權重（模式：${[...modesSeen].sort().join('、')}）。`);
  }

  /* ---- 08_Combo_Weights → comboWeights[mode][step][col][symbolId] ---- */
  const comboWeights: Record<string, Record<number, Record<number, Record<string, number>>>> = {};
  let comboMaxStep = 0;
  for (const r of records(getSheet(m, 'combo_weights'))) {
    const mode = (field(r, 'Mode_Scope', 'Mode') || 'NG').trim().toUpperCase();
    const step = parseInt(field(r, 'Combo_Step', 'Step'), 10);
    const reelId = parseInt(field(r, 'Reel_ID', 'Reel'), 10);
    const symId = field(r, 'Symbol_ID', 'Symbol').trim();
    const wt = numOr(field(r, 'Weight'), NaN);
    if (!Number.isFinite(step) || !Number.isFinite(reelId) || !symId || !Number.isFinite(wt)) continue;
    if (!symById.has(symId)) continue;
    (((comboWeights[mode] ??= {})[step] ??= {})[reelId - 1] ??= {})[symId] = wt;
    comboMaxStep = Math.max(comboMaxStep, step);
  }
  const hasComboWeights = Object.keys(comboWeights).length > 0;
  if (hasComboWeights) {
    info.push(`08_Combo_Weights：已載入連爆逐步權重（最多 ${comboMaxStep} 步），於「連爆」啟用時生效。`);
  }

  /* ---- 06_Paylines ---- */
  const paylines: PaylineDef[] = [];
  let coveredAllCols = true;
  for (const r of records(getSheet(m, 'paylines'))) {
    const path = field(r, 'Path').trim();
    if (!path) continue;
    const id = Math.round(numOr(field(r, 'Line_ID', 'ID'), paylines.length + 1));
    const rows = new Array<number>(cols).fill(-1);
    let touched = 0;
    for (const mt of path.matchAll(/\(\s*(\d+)\s*,\s*(\d+)\s*\)/g)) {
      const col = parseInt(mt[1], 10) - 1; // 1-indexed reel
      const row = parseInt(mt[2], 10) - 1; // 1-indexed, top-down → 0-indexed top-down
      if (col >= 0 && col < cols && row >= 0) {
        rows[col] = row;
        touched++;
      }
    }
    if (touched === 0) continue;
    if (touched < cols) coveredAllCols = false;
    if ((field(r, 'Direction') || 'LTR').toUpperCase() === 'RTL') {
      warnings.push(`06_Paylines 第 ${id} 線為 RTL（由右往左）：引擎僅支援 LTR，已當作 LTR 處理。`);
    }
    paylines.push({ id, rows });
  }
  if (payMode === 'payline' && coveredAllCols === false && paylines.length) {
    info.push(`06_Paylines：部分得分線未涵蓋全部 ${cols} 軸（依設定檔忠實匯入，未涵蓋的軸不參與該線）。`);
  }

  /* ---- 11_Mode_Config → triggers + features ---- */
  const triggers: TriggerDef[] = [];
  const features: FeatureConfigEntry[] = [];
  const targets: MathTarget[] = [{ mode: 'NG', hitRate: 0.25, avgWinX: 1.5, minWinX: 0 }];

  for (const r of records(getSheet(m, 'mode_config'))) {
    const mode = field(r, 'Mode').trim().toUpperCase();
    if (!mode || mode === 'NG') continue;
    const cond = field(r, 'Trigger_Condition', 'Trigger').trim();
    const spins = Math.max(1, Math.round(numOr(field(r, 'Spin_Count', 'Spins'), 10)));

    const parsed = parseTriggerCondition(cond);
    const resolved = parsed ? resolveSymbol(parsed.token, symbols) : null;
    if (parsed && resolved) {
      if (!isScatterSymbol(symById.get(resolved.id))) {
        warnings.push(
          `11_Mode_Config ${mode} 觸發綁定到「${resolved.id}」(依條件 ${parsed.token})，` +
            `但被標記為 Scatter 的是「${scatterSymbolId(symbols) ?? '無'}」。如需改綁請於「機制」分頁調整。`,
        );
      } else if (parsed.token.toLowerCase() === resolved.id.toLowerCase()) {
        info.push(`11_Mode_Config ${mode}：${resolved.id} ≥ ${parsed.value} 觸發（${spins} 盤）。`);
      } else {
        info.push(`11_Mode_Config ${mode}：條件「${parsed.token}」解析為 Scatter 圖示「${resolved.id}」，${resolved.id} ≥ ${parsed.value} 觸發（${spins} 盤）。`);
      }
    } else if (cond) {
      warnings.push(`11_Mode_Config ${mode} 觸發條件「${cond}」無法解析，已略過該觸發。`);
    }

    const featId = mode.toLowerCase();
    const kind = mode === 'FG' ? 'freegame' : mode.toLowerCase();
    const trigSym = resolved?.id;
    features.push({
      id: featId,
      type: 'freeGame',
      enabled: true,
      params: {
        spins,
        kind,
        winMultiplier: 1,
        ...(trigSym ? { retriggerSymbol: trigSym, retriggerCount: parsed?.value ?? 3, retriggerSpins: spins } : {}),
      },
    });
    if (parsed && resolved) {
      triggers.push({
        id: `trg_${featId}`,
        name: `${mode} ${resolved.id}×${parsed.value}`,
        target: featId,
        rule: {
          logic: 'AND',
          conditions: [{ symbolId: resolved.id, comparator: parsed.comparator, value: parsed.value }],
        },
      });
    }
    targets.push({
      mode,
      hitRate: mode === 'FG' ? 0.45 : 0.3,
      avgWinX: mode === 'FG' ? 60 : 20,
      minWinX: 0,
    });
  }
  if (targets.length > 1) {
    info.push('數學目標（得分率/均倍）為占位預設值，可於「一般」分頁調整；不影響轉動與中獎判定。');
  }

  /* ---- 09/10/12：列為略過 ---- */
  if (records(getSheet(m, 'puzzle_rules')).length) {
    warnings.push('09_Puzzle_Rules（拼圖/重構規則）無引擎機制，已略過。');
  }
  if (records(getSheet(m, 'discard_rules')).length) {
    warnings.push('10_Discard_Rules（棄牌規則）無引擎機制，已略過。');
  }
  if (records(getSheet(m, 'distribution_bins')).length) {
    info.push('12_Distribution_Bins 僅有區間邊界、無占比，未套用占比重塑，改用自然權重產生結果。');
  }

  // 賠付/權重健康檢查（讓使用者知道為何按 Spin 不會中獎）
  const anyPay = symbols.some((s) => s.payout.some((p) => p > 0));
  if (!anyPay) {
    warnings.push('注意（非引擎限制，資料未填）：設定檔所有圖示賠付為 0 → 盤面會正常轉動但不會中獎。請於設定檔填好 Pay_3x~6x 後重新匯入，或於「圖示」分頁直接調整。');
  }

  /* ------------------------------ assemble ------------------------------- */
  const config: GameConfig = {
    meta: { name: sourceName, version: '1.0.0' },
    user: { name: 'Player', balance: 1_000_000 },
    bet: { default: 100, steps: [10, 20, 50, 100, 200, 500, 1000] },
    math: {
      mode: 'weight',
      targetRTP: 0.96,
      targetBF: 150,
      targets,
      // winDistribution 故意留空 → 使用自然權重（不做占比重塑）。
    },
    grid: { cols, shape: [...shape] },
    pay: {
      mode: payMode,
      minMatch,
      maxMatch,
      clusterMin,
      ...(payMode === 'payline' ? { paylines } : {}),
    },
    cascade: { enabled: false, showStepWin: true, refill: 'fillDown' },
    symbols,
    wild: { substituteSymbols: ['*'], multiplier: 1, expand: false, sticky: false },
    reels: {
      // weight 模式不使用 strips，但保留每軸一條（全圖示）以免 cheats/replay 取值出錯。
      strips: Array.from({ length: cols }, () => symbols.map((s) => s.id)),
    },
    ...(hasReelWeights ? { reelWeights } : {}),
    ...(symbolCaps.length ? { symbolCaps } : {}),
    ...(hasComboWeights ? { comboWeights } : {}),
    triggers,
    features,
    buyOptions: [],
    animation: {
      type: 'rolling',
      normal: { totalSpinTime: 700, spinSpeed: 1, stopInterval: 120, bounceDuration: 140, bounceCurve: 'easeOut', roundGap: 500 },
      turbo: { totalSpinTime: 200, spinSpeed: 2, stopInterval: 40, bounceDuration: 60, bounceCurve: 'easeOut', roundGap: 250 },
    },
    paytableInfo: {
      format: 'markdown',
      content: `# ${sourceName}\n\n由設定檔匯入（忠實匯入，未填示範數值）。`,
    },
  };

  return { config, warnings, info };
}

/* ----------------------------- sub-parsers -------------------------------- */

interface PayHeader {
  header: string;
  count: number;
}

/** Find Pay_3x / Pay_4x ... columns in the symbols sheet, sorted by count. */
function collectPayHeaders(sheet: string[][]): PayHeader[] {
  const headerRow = sheet.find((r) => r.some((c) => (c ?? '').trim() !== '')) ?? [];
  const out: PayHeader[] = [];
  for (const h of headerRow) {
    const mt = (h ?? '').trim().match(/^Pay_?(\d+)x?$/i);
    if (mt) out.push({ header: (h ?? '').trim(), count: parseInt(mt[1], 10) });
  }
  return out.sort((a, b) => a.count - b.count);
}

function maxReelId(sheet: string[][]): number {
  let max = 0;
  for (const r of records(sheet)) {
    const id = parseInt(field(r, 'Reel_ID', 'Reel'), 10);
    if (Number.isFinite(id)) max = Math.max(max, id);
  }
  return max;
}

interface ParsedCond {
  token: string;
  comparator: '>=' | '>' | '=' | '<' | '<=';
  value: number;
}

/** Parse "symbol_count.SCAT >= 3" (and a few variants) into token/comparator/value. */
function parseTriggerCondition(cond: string): ParsedCond | null {
  if (!cond) return null;
  const mt = cond.match(/(?:symbol_count\.)?([A-Za-z0-9_]+)\s*(>=|<=|==|=|>|<)\s*([0-9]+(?:\.[0-9]+)?)/);
  if (!mt) return null;
  const cmpRaw = mt[2] === '==' ? '=' : mt[2];
  return { token: mt[1], comparator: cmpRaw as ParsedCond['comparator'], value: parseFloat(mt[3]) };
}

function isScatterSymbol(s: SymbolDefinition | undefined): boolean {
  return !!s && s.type.includes('scatter');
}

function scatterSymbolId(symbols: SymbolDefinition[]): string | null {
  return symbols.find((s) => s.type.includes('scatter'))?.id ?? null;
}

/** Common scatter aliases used in trigger conditions. */
const SCATTER_ALIASES = new Set(['sc', 'scat', 'scatter', 'scatters', 'free', 'fg']);

/**
 * Resolve a trigger token (e.g. SCAT) to a concrete symbol id.
 * Priority: exact id → (scatter-alias token ⇒ the flagged Scatter symbol) →
 * prefix match → any flagged Scatter. The alias step is intentionally narrow so
 * a normal token (e.g. "H1") still binds to its own symbol, never to the scatter.
 */
function resolveSymbol(token: string, symbols: SymbolDefinition[]): { id: string } | null {
  if (!token || !symbols.length) return null;
  const t = token.toLowerCase();
  // 1) exact id
  let hit = symbols.find((s) => s.id.toLowerCase() === t);
  // 2) recognised scatter alias → prefer the Is_Scatter-flagged symbol
  //    (handles "SCAT" → FREE even when an unrelated symbol is literally "SCATTER")
  if (!hit && SCATTER_ALIASES.has(t)) hit = symbols.find((s) => s.type.includes('scatter'));
  // 3) prefix either way (SCAT ↔ SCATTER), preferring a flagged scatter
  if (!hit) {
    const cands = symbols.filter(
      (s) => s.id.toLowerCase().startsWith(t) || t.startsWith(s.id.toLowerCase()),
    );
    hit = cands.find((s) => s.type.includes('scatter')) ?? cands[0];
  }
  // 4) fall back to the flagged scatter symbol
  if (!hit) hit = symbols.find((s) => s.type.includes('scatter'));
  return hit ? { id: hit.id } : null;
}
