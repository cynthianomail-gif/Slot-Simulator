import type { GameConfig, BuyOption } from '@/types';
import type { PlayOptions } from './gameEngine';

export interface BuyResolution {
  option: BuyOption;
  cost: number; // absolute cost = option.cost * bet
  play: PlayOptions;
}

/**
 * Buy Feature engine. Converts a purchased option into a forced-trigger
 * PlayOptions and an absolute cost (option.cost is a multiple of bet).
 */
export function resolveBuy(
  config: GameConfig,
  optionId: string,
  bet: number,
): BuyResolution | null {
  const option = config.buyOptions.find((o) => o.id === optionId);
  if (!option) return null;
  return {
    option,
    cost: option.cost * bet,
    play: {
      bet,
      forcedTriggers: [option.forceTarget],
    },
  };
}

export function listBuyOptions(config: GameConfig): BuyOption[] {
  return config.buyOptions;
}
