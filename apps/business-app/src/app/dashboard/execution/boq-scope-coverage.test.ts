import { describe, expect, it } from 'vitest';
import {
  BOQ_SCOPE_WORKS,
  summarizeBoqScope,
  type BoqScopeReview,
} from './boq-scope-coverage';

const rows = (code: string, quantity: number, rate: number) => [
  {
    inputs: { scopeCode: code },
    outputs: [{ quantity, rate }],
  },
];

describe('BOQ required work scope completeness', () => {
  it('never counts missing required work as priced or automatically excluded', () => {
    const summary = summarizeBoqScope([], {});
    expect(summary.pending).toBe(BOQ_SCOPE_WORKS.length);
    expect(summary.unpriced).toBe(0);
    expect(summary.complete).toBe(false);
  });

  it('treats explicit costed rows as included scope without double counting', () => {
    const first = BOQ_SCOPE_WORKS[0]!.code;
    const summary = summarizeBoqScope(
      [...rows(first, 3, 1000), ...rows(first, 2, 250)],
      {},
    );
    expect(summary.items.find((item) => item.code === first)?.status).toBe(
      'priced',
    );
    expect(summary.priced).toBe(1);
    expect(summary.pending).toBe(BOQ_SCOPE_WORKS.length - 1);
  });

  it('flags a measured item with zero cost as unpriced even if quantity exists', () => {
    const first = BOQ_SCOPE_WORKS[0]!.code;
    const summary = summarizeBoqScope(rows(first, 10, 0), {});
    expect(summary.items[0]?.status).toBe('unpriced');
    expect(summary.unpriced).toBe(1);
    expect(summary.complete).toBe(false);
  });

  it('keeps an unmeasured placeholder unresolved even if a rate was entered', () => {
    const first = BOQ_SCOPE_WORKS[0]!.code;
    const summary = summarizeBoqScope(rows(first, 0, 1500), {});
    expect(summary.items[0]?.status).toBe('unpriced');
    expect(summary.complete).toBe(false);
  });

  it('requires an explicit decision when a work is in other contract scope', () => {
    const reviews: Record<string, BoqScopeReview> = {};
    for (const work of BOQ_SCOPE_WORKS) reviews[work.code] = 'excluded';
    reviews[BOQ_SCOPE_WORKS[0]!.code] = 'covered';
    const summary = summarizeBoqScope([], reviews);
    expect(summary.pending).toBe(0);
    expect(summary.unpriced).toBe(0);
    expect(summary.covered).toBe(1);
    expect(summary.excluded).toBe(BOQ_SCOPE_WORKS.length - 1);
    expect(summary.complete).toBe(true);
  });

  it('does not let a stale covered decision conceal a newly unpriced measurement', () => {
    const first = BOQ_SCOPE_WORKS[0]!.code;
    const summary = summarizeBoqScope(rows(first, 1, 0), {
      [first]: 'covered',
    });
    expect(summary.unpriced).toBe(1);
    expect(summary.complete).toBe(false);
  });
});
