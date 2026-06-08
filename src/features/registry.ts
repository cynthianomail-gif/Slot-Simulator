import type { FeatureFactory, FeaturePlugin } from './types';
import { FreeGameFeature } from './freeGame';
import { RespinFeature } from './respin';
import { HoldAndSpinFeature } from './holdAndSpin';

/**
 * Feature registry. New features are added here without touching the engine or
 * the UI — the system is open for extension (requirement #9 / #11).
 *
 * To add a feature:
 *   1. implement FeaturePlugin in a new file
 *   2. register its factory below
 *   3. reference it from GameConfig.features[].type
 */
const registry = new Map<string, FeatureFactory>();

export function registerFeature(type: string, factory: FeatureFactory): void {
  registry.set(type, factory);
}

export function createFeature(type: string): FeaturePlugin | null {
  const factory = registry.get(type);
  return factory ? factory() : null;
}

export function registeredFeatureTypes(): string[] {
  return [...registry.keys()];
}

// ---- built-in registrations ----
registerFeature('freeGame', () => new FreeGameFeature());
registerFeature('respin', () => new RespinFeature());
registerFeature('holdAndSpin', () => new HoldAndSpinFeature());
