import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseSlotPlannerMatrices, type SheetMatrices } from '../parseWorkbook';
import { reelSymbolWeights, spinReels, effectiveCaps } from '@/engine/reel';
import { Rng } from '@/engine/rng';

const matrices: SheetMatrices = JSON.parse(
  readFileSync(new URL('./fixture.workbook.json', import.meta.url), 'utf-8'),
);

const { config, warnings, info } = parseSlotPlannerMatrices(matrices, '測試設定檔');

describe('parseSlotPlannerMatrices — 盤面 / 圖示', () => {
  it('layout → 6 軸、shape [4,4,4,4,3,3]', () => {
    expect(config.grid.cols).toBe(6);
    expect(config.grid.shape).toEqual([4, 4, 4, 4, 3, 3]);
  });

  it('匯入 15 個圖示，weight/payout 忠實對應', () => {
    expect(config.symbols).toHaveLength(15);
    const icon00 = config.symbols.find((s) => s.id === 'icon00')!;
    expect(icon00.weight).toBe(68);
    expect(icon00.payout).toEqual([0, 0, 0, 0]); // Pay_3x..Pay_6x
  });

  it('WILD → wild 型別，且受 REEL_RESTRICT 限定 2/3/4 軸', () => {
    const wild = config.symbols.find((s) => s.id === 'WILD')!;
    expect(wild.type).toContain('wild');
    expect(wild.excludeReels).toEqual([1, 5, 6]);
  });

  it('FREE 為 scatter（Is_Scatter）', () => {
    const free = config.symbols.find((s) => s.id === 'FREE')!;
    expect(free.type).toContain('scatter');
  });
});

describe('parseSlotPlannerMatrices — 得分 / 觸發', () => {
  it('pay_type LINE → payline，minMatch 3 / maxMatch 6', () => {
    expect(config.pay.mode).toBe('payline');
    expect(config.pay.minMatch).toBe(3);
    expect(config.pay.maxMatch).toBe(6);
  });

  it('paylines：忽略空白路徑，1-indexed 轉 0-indexed top-down', () => {
    expect(config.pay.paylines).toHaveLength(4); // lines 1-4 有路徑，5-6 空白
    const l1 = config.pay.paylines!.find((l) => l.id === 1)!;
    expect(l1.rows).toEqual([0, 0, 0, 0, 0, -1]); // 第 6 軸未涵蓋 → -1
    const l4 = config.pay.paylines!.find((l) => l.id === 4)!;
    expect(l4.rows).toEqual([0, 1, 2, 1, 0, -1]); // V 形
  });

  it('FG 觸發 → freeGame feature + trigger，SCAT 解析為被標記的 Scatter（FREE）', () => {
    expect(config.features).toHaveLength(1);
    const fg = config.features[0];
    expect(fg.type).toBe('freeGame');
    expect(fg.params.spins).toBe(10);
    expect(fg.params.retriggerSymbol).toBe('FREE');

    expect(config.triggers).toHaveLength(1);
    const trg = config.triggers[0];
    expect(trg.target).toBe(fg.id);
    // SCAT alias resolves to the Is_Scatter-flagged symbol FREE (not the unflagged "SCATTER")
    expect(trg.rule.conditions?.[0]).toMatchObject({ symbolId: 'FREE', comparator: '>=', value: 3 });
  });
});

describe('parseSlotPlannerMatrices — 權重（每軸 × 每模式）', () => {
  it('reelWeights 含 NG 與 FG 兩模式', () => {
    expect(config.reelWeights).toBeDefined();
    expect(Object.keys(config.reelWeights!).sort()).toEqual(['FG', 'NG']);
    expect(config.reelWeights!['NG'][0]['icon01']).toBe(100);
    expect(config.reelWeights!['FG'][0]['icon01']).toBe(100);
  });

  it('math 採 weight 模式，winDistribution 留空（自然權重）', () => {
    expect(config.math.mode).toBe('weight');
    expect(config.math.winDistribution).toBeUndefined();
  });
});

describe('圖示數量上限 / 連爆逐步權重 — 已做成引擎', () => {
  it('symbolCaps 來自 Max_Count + GLOBAL_MAX（含模式範圍）', () => {
    const caps = config.symbolCaps ?? [];
    // 03_Symbols Max_Count（全模式）
    expect(caps).toContainEqual({ symbolId: 'icon00', max: 1 });
    expect(caps).toContainEqual({ symbolId: 'FREE', max: 3 });
    // 07_Constraints GLOBAL_MAX：WILD=1 (ALL) / SCATTER=3 (NG)
    expect(caps).toContainEqual({ symbolId: 'WILD', max: 1 });
    expect(caps).toContainEqual({ symbolId: 'SCATTER', max: 3, modes: ['NG'] });
  });

  it('comboWeights 載入 NG/FG 兩模式（08_Combo_Weights）', () => {
    expect(config.comboWeights).toBeDefined();
    expect(Object.keys(config.comboWeights!).sort()).toEqual(['FG', 'NG']);
  });

  it('這些不再列為「無引擎機制」警告', () => {
    const all = warnings.join('\n');
    expect(all).not.toContain('Max_Count');
    expect(all).not.toContain('GLOBAL_MAX');
    expect(all).not.toContain('08_Combo_Weights');
    expect(info.some((i) => i.includes('圖示數量上限已套用'))).toBe(true);
  });
});

describe('warnings / info — 透明回報', () => {
  it('回報全零賠付（會轉但不中獎，標明非引擎限制）', () => {
    expect(warnings.some((w) => w.includes('賠付為 0'))).toBe(true);
  });

  it('info 說明 SCAT 已解析為 Scatter 圖示 FREE', () => {
    expect(info.some((i) => i.includes('解析為 Scatter 圖示「FREE」'))).toBe(true);
  });

  it('有對應說明（每軸權重、限定軸）', () => {
    expect(info.some((i) => i.includes('每軸'))).toBe(true);
  });
});

describe('引擎整合 — 圖示數量上限 (caps) 限制落定盤面', () => {
  it('NG 盤面中 WILD ≤ 1、SCATTER ≤ 3、icon00 ≤ 1（多次抽樣）', () => {
    const rng = new Rng(20260615);
    let maxWild = 0, maxScatter = 0, maxIcon00 = 0, maxFree = 0;
    for (let n = 0; n < 400; n++) {
      const { grid } = spinReels(config, rng, 'NG');
      const count = (id: string) => grid.columns.reduce((a, c) => a + c.filter((x) => x === id).length, 0);
      maxWild = Math.max(maxWild, count('WILD'));
      maxScatter = Math.max(maxScatter, count('SCATTER'));
      maxIcon00 = Math.max(maxIcon00, count('icon00'));
      maxFree = Math.max(maxFree, count('FREE'));
    }
    expect(maxWild).toBeLessThanOrEqual(1);
    expect(maxScatter).toBeLessThanOrEqual(3);
    expect(maxIcon00).toBeLessThanOrEqual(1);
    expect(maxFree).toBeLessThanOrEqual(3);
  });

  it('FG 模式 SCATTER 不受上限（NG-only），但 WILD 仍 ≤ 1', () => {
    const caps = effectiveCaps(config, 'FG');
    expect(caps.has('SCATTER')).toBe(false); // GLOBAL_MAX SCATTER 限 NG
    expect(caps.get('WILD')).toBe(1);        // WILD 為 ALL
    expect(caps.get('FREE')).toBe(3);        // Max_Count 全模式
  });
});

describe('引擎整合 — reelSymbolWeights 吃 reelWeights', () => {
  it('NG：第 1 軸（col 0）排除 WILD，且權重來自 reelWeights', () => {
    const { ids, weights } = reelSymbolWeights(config, 0, 'NG');
    expect(ids).not.toContain('WILD'); // 被 REEL_RESTRICT 排除
    const i = ids.indexOf('icon00');
    expect(weights[i]).toBe(68 === 68 ? config.reelWeights!['NG'][0]['icon00'] : 0);
    expect(weights[i]).toBe(100); // 04_Reel_Weights icon00 = 100（覆寫 symbol.weight 68）
  });

  it('NG：第 2 軸（col 1）保留 WILD', () => {
    const { ids } = reelSymbolWeights(config, 1, 'NG');
    expect(ids).toContain('WILD');
  });

  it('FG 模式可取得 FG 層權重', () => {
    const { ids, weights } = reelSymbolWeights(config, 1, 'FG');
    const i = ids.indexOf('icon01');
    expect(weights[i]).toBe(config.reelWeights!['FG'][1]['icon01']);
  });
});
