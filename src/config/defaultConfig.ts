import type { GameConfig, PaylineDef } from '@/types';
import { buildDefaultStrips } from './strips';

/* 10 fixed paylines for a 5x3 board (row index per column, 0 = top row). */
const PAYLINES_5x3: PaylineDef[] = [
  { id: 1, rows: [1, 1, 1, 1, 1] },
  { id: 2, rows: [2, 2, 2, 2, 2] },
  { id: 3, rows: [0, 0, 0, 0, 0] },
  { id: 4, rows: [2, 1, 0, 1, 2] },
  { id: 5, rows: [0, 1, 2, 1, 0] },
  { id: 6, rows: [1, 2, 2, 2, 1] },
  { id: 7, rows: [1, 0, 0, 0, 1] },
  { id: 8, rows: [2, 2, 1, 0, 0] },
  { id: 9, rows: [0, 0, 1, 2, 2] },
  { id: 10, rows: [1, 2, 1, 0, 1] },
];

export const defaultConfig: GameConfig = {
  meta: { name: '範例拉霸 — 水晶連線', version: '0.1.0' },

  user: { name: 'Player', balance: 1_000_000 },

  bet: { default: 100, steps: [10, 20, 50, 100, 200, 500, 1000] },

  math: {
    mode: 'weight',
    targetRTP: 0.985,
    targetBF: 150,
  },

  grid: {
    cols: 5,
    shape: [3, 3, 3, 3, 3],
  },

  pay: {
    mode: 'payline',
    minMatch: 3,
    paylines: PAYLINES_5x3,
    clusterMin: 8,
  },

  symbols: [
    { id: 'WILD', name: '百搭 Wild', type: ['wild', 'expanding'], weight: 2.55, payout: [0, 0, 0] },
    { id: 'SC', name: '分散 Scatter', type: ['scatter'], weight: 2, payout: [0, 0, 0] },
    { id: 'BO', name: 'Bonus 金幣', type: ['bonus', 'collector'], weight: 1, payout: [0, 0, 0] },
    { id: 'H1', name: '鑽石', type: ['normal'], weight: 4, payout: [8, 20, 80] },
    { id: 'H2', name: '紅寶石', type: ['normal'], weight: 5, payout: [6, 16, 64] },
    { id: 'H3', name: '綠寶石', type: ['normal'], weight: 6, payout: [4, 12, 40] },
    { id: 'H4', name: '藍寶石', type: ['normal'], weight: 7, payout: [3, 8, 24] },
    { id: 'LA', name: 'A', type: ['normal'], weight: 9, payout: [2, 4, 12] },
    { id: 'LK', name: 'K', type: ['normal'], weight: 10, payout: [2, 4, 10] },
    { id: 'LQ', name: 'Q', type: ['normal'], weight: 11, payout: [1, 3, 8] },
    { id: 'LJ', name: 'J', type: ['normal'], weight: 12, payout: [1, 2, 6] },
  ],

  wild: {
    substituteSymbols: ['H1', 'H2', 'H3', 'H4', 'LA', 'LK', 'LQ', 'LJ'],
    multiplier: 1,
    expand: false,
    sticky: false,
  },

  reels: {
    // Generated from DEFAULT_STRIP_SPEC (tuned for BF ≈ 1/150).
    strips: buildDefaultStrips(5),
  },

  triggers: [
    {
      id: 'trg_fg',
      name: '3+ Scatter → Free Game',
      target: 'fg',
      rule: {
        logic: 'AND',
        conditions: [{ symbolId: 'SC', comparator: '>=', value: 3 }],
      },
    },
    {
      id: 'trg_bonus',
      name: '6+ Bonus Coin → Hold & Spin',
      target: 'hs',
      rule: {
        logic: 'AND',
        conditions: [{ symbolId: 'BO', comparator: '>=', value: 6 }],
      },
    },
  ],

  features: [
    {
      id: 'fg',
      type: 'freeGame',
      enabled: true,
      params: {
        spins: 10,
        kind: 'freegame',
        winMultiplier: 1.5, // tuned so overall RTP ≈ 96%
        retriggerSymbol: 'SC',
        retriggerCount: 3,
        retriggerSpins: 5,
      },
    },
    {
      id: 'rs',
      type: 'respin',
      enabled: true,
      params: { maxRespins: 3, resetOnWin: true, kind: 'respin' },
    },
    {
      id: 'hs',
      type: 'holdAndSpin',
      enabled: true,
      params: { respins: 3, collectorSymbol: 'BO', kind: 'hold' },
    },
  ],

  buyOptions: [
    { id: 'buy_fg', name: '免費遊戲', cost: 80, forceTarget: 'fg' },
    {
      id: 'buy_super_fg',
      name: '超級免費遊戲',
      cost: 200,
      forceTarget: 'fg',
      payload: { spins: 20, winMultiplier: 3 },
    },
    { id: 'buy_bonus', name: 'Bonus（Hold & Spin）', cost: 120, forceTarget: 'hs' },
  ],

  animation: {
    type: 'rolling',
    normal: {
      totalSpinTime: 700,
      spinSpeed: 1,
      stopInterval: 120,
      bounceDuration: 140,
      bounceCurve: 'easeOut',
    },
    turbo: {
      totalSpinTime: 200,
      spinSpeed: 2,
      stopInterval: 40,
      bounceDuration: 60,
      bounceCurve: 'easeOut',
    },
  },

  paytableInfo: {
    format: 'markdown',
    content: [
      '# 水晶連線 — 賠付表',
      '',
      '**鑽石** 三/四/五連線賠付 10 / 25 / 100。',
      '',
      '- **Wild** 可替代所有可派彩圖示。',
      '- **3 個以上 Scatter** 觸發 **免費遊戲**（10 盤、1.5× 贏分、可再觸發）。',
      '- **6 個以上 Bonus 金幣** 觸發 **Hold & Spin**。',
      '',
      '_目標 RTP 96.0% · 目標 BF 150 局 1 次。_',
    ].join('\n'),
  },
};
