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

  it('treats a manually selected different quote as Final', () => {
    expect(chooseProjectQuote('p1', quotes, { p1: 'a' })).toMatchObject({
      quote: { quotationId: 'a' },
      isFinal: true,
    });
  });

  it('treats the newest saved quote returned by the database as Final by default', () => {
    expect(chooseProjectQuote('p1', quotes, { p1: 'b' })).toMatchObject({
      quote: { quotationId: 'b' },
      isFinal: true,
    });
  });

  it('never selects another project or a cancelled quote as Final', () => {
    expect(chooseProjectQuote('p1', quotes, { p1: 'c' })).toBeNull();
    expect(chooseProjectQuote('p1', quotes, { p1: 'd' })).toBeNull();
    expect(
      chooseProjectQuote('p2', quotes, { p2: 'd' })?.quote.quotationId,
    ).toBe('d');
  });

  it('fails closed when the authorized effective-project lookup is missing', () => {
    expect(chooseProjectQuote('p1', quotes, {})).toBeNull();
    expect(chooseProjectQuote('p3', quotes, { p3: 'a' })).toBeNull();
    expect(
      chooseProjectQuote('p1', [quotes[2]!], { p1: 'c' }),
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
