import { describe, expect, it } from 'vitest';
import {
  chooseProjectQuote,
  projectQuoteLabel,
  type ProjectQuoteCandidate,
} from './boq-project-quote';

const quote = (
  id: string,
  createdAt: string,
  extra: Partial<ProjectQuoteCandidate> = {},
): ProjectQuoteCandidate => ({
  quotationId: id,
  projectId: 'p1',
  customerId: 'c1',
  quotationNumber: `Q-${id}`,
  revisionId: `r-${id}`,
  revisionNumber: 1,
  status: 'issued',
  revisionStatus: 'issued',
  createdAt,
  ...extra,
});

describe('BOQ project quotation', () => {
  const quotes = [
    quote('a', '2026-11-01'),
    quote('b', '2026-11-10'),
    quote('c', '2026-11-12', { status: 'cancelled' }),
    quote('d', '2026-11-15', { projectId: 'p2' }),
  ];

  it('uses the Final quotation of the project', () => {
    expect(chooseProjectQuote('p1', 'c1', quotes, { c1: 'a' })).toMatchObject({
      quote: { quotationId: 'a' },
      isFinal: true,
    });
  });

  it('falls back to the latest active quotation of the project', () => {
    expect(chooseProjectQuote('p1', 'c1', quotes, {})).toMatchObject({
      quote: { quotationId: 'b' },
      isFinal: false,
    });
    // A Final quote that is cancelled or belongs to another project is ignored.
    expect(
      chooseProjectQuote('p1', 'c1', quotes, { c1: 'c' })?.quote.quotationId,
    ).toBe('b');
    expect(
      chooseProjectQuote('p1', 'c1', quotes, { c1: 'd' })?.quote.quotationId,
    ).toBe('b');
  });

  it('returns nothing when the project has no active quotation', () => {
    expect(chooseProjectQuote('p3', 'c1', quotes, {})).toBeNull();
    expect(
      chooseProjectQuote('p1', 'c1', [quotes[2]!], { c1: 'c' }),
    ).toBeNull();
  });

  it('names the quotation after the customer and package', () => {
    expect(
      projectQuoteLabel({
        customerName: 'Ravi',
        packageName: 'Premium',
        quotationNumber: 'Q-2026-000006',
        revisionNumber: 2,
        isFinal: true,
      }),
    ).toBe('Ravi · Premium estimate · Q-2026-000006 v2 · Final');
    expect(
      projectQuoteLabel({
        customerName: null,
        packageName: null,
        quotationNumber: 'Q-1',
        revisionNumber: 1,
        isFinal: false,
      }),
    ).toBe('Customer · Estimate · Q-1 v1 · Latest');
  });
});
