import { describe, expect, it } from 'vitest';
import {
  formatPaymentPercent,
  PAYMENT_PERCENT_PATTERN,
} from './payment-percent';

describe('quotation payment stage percentages', () => {
  it('accepts the percentages the construction editor sends', () => {
    // E2E quotation: 33 floor-wise milestones of ₹1,08,01,550.
    const total = 10801550;
    for (const amount of [540077.5, 172824.8, 118817.05, 982941.05]) {
      const sent = formatPaymentPercent((amount / total) * 100);
      expect(sent).toMatch(PAYMENT_PERCENT_PATTERN);
    }
    expect(formatPaymentPercent(5)).toBe('5.00000000');
  });

  it('still accepts typed whole and two-decimal percentages', () => {
    for (const typed of ['20', '12.5', '33.33'])
      expect(typed).toMatch(PAYMENT_PERCENT_PATTERN);
  });

  it('rejects malformed or over-precise values', () => {
    for (const bad of ['', '-5', '5.', '1e2', '5.123456789', '5%'])
      expect(bad).not.toMatch(PAYMENT_PERCENT_PATTERN);
  });
});
