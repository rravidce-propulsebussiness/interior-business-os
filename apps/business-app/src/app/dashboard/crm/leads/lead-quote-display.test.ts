import { describe, expect, it } from 'vitest';
import { leadQuoteLabel } from './lead-quote-display';

describe('CRM quote presentation', () => {
  it('shows saved quotations without exposing internal draft status', () => {
    expect(leadQuoteLabel('draft')).toBe('Saved');
    expect(leadQuoteLabel(null)).toBe('Saved');
    expect(leadQuoteLabel('issued')).toBe('Ready to share');
  });
  it('preserves user-visible shared and history states', () => {
    expect(leadQuoteLabel('draft', true)).toBe('Shared');
    expect(leadQuoteLabel('superseded')).toBe('Previous version');
    expect(leadQuoteLabel('cancelled')).toBe('Archived');
  });
});
