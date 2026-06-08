import type {
  TriggerNode,
  TriggerCondition,
  TriggerDef,
  Comparator,
} from '@/types';

/**
 * Trigger engine. Evaluates a composable boolean tree (AND/OR/NOT) of leaf
 * conditions against an evaluation context.
 *
 * The context provides:
 *  - symbolCounts: how many of each symbol id are on the grid.
 *  - metrics: arbitrary named numbers (e.g. totalMultiplier, win, scatterCount).
 */

export interface TriggerContext {
  symbolCounts: Record<string, number>;
  metrics: Record<string, number>;
}

function compare(a: number, op: Comparator, b: number): boolean {
  switch (op) {
    case '>=':
      return a >= b;
    case '>':
      return a > b;
    case '=':
      return a === b;
    case '<':
      return a < b;
    case '<=':
      return a <= b;
    default:
      return false;
  }
}

function evalCondition(cond: TriggerCondition, ctx: TriggerContext): boolean {
  let lhs = 0;
  if (cond.symbolId !== undefined) {
    lhs = ctx.symbolCounts[cond.symbolId] ?? 0;
  } else if (cond.metric !== undefined) {
    lhs = ctx.metrics[cond.metric] ?? 0;
  }
  return compare(lhs, cond.comparator, cond.value);
}

export function evalTriggerNode(node: TriggerNode, ctx: TriggerContext): boolean {
  const condResults = (node.conditions ?? []).map((c) => evalCondition(c, ctx));
  const childResults = (node.children ?? []).map((ch) =>
    evalTriggerNode(ch, ctx),
  );
  const all = [...condResults, ...childResults];

  switch (node.logic) {
    case 'AND':
      return all.length > 0 && all.every(Boolean);
    case 'OR':
      return all.some(Boolean);
    case 'NOT':
      // NOT is satisfied when none of the contained conditions are true.
      return !all.some(Boolean);
    default:
      return false;
  }
}

/** Evaluate every trigger definition; return the ids of those that fire. */
export function evalTriggers(
  triggers: TriggerDef[],
  ctx: TriggerContext,
): TriggerDef[] {
  return triggers.filter((t) => evalTriggerNode(t.rule, ctx));
}
