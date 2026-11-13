'use client';

import { useState } from 'react';
import Link from 'next/link';

type Customer = { id: string; name: string };
type Quote = { revisionId: string; number: string; status: string };

/** Projects enter execution from an existing customer's quotation. */
export function NewProjectForCustomer({
  customers,
  quotesByCustomer = {},
  canCreateQuote = false,
  initialCustomerId = '',
}: {
  customers: Customer[];
  quotesByCustomer?: Record<string, Quote[]>;
  canCreateQuote?: boolean;
  initialCustomerId?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [customerId, setCustomerId] = useState(
    initialCustomerId || customers[0]?.id || '',
  );
  const customer = customers.find((item) => item.id === customerId);
  const quotes = customerId ? quotesByCustomer[customerId] ?? [] : [];
  const quoteUrl = customerId
    ? '/dashboard/quotations/new?customer=' + encodeURIComponent(customerId)
    : '/dashboard/quotations/new';

  if (!customers.length)
    return (
      <Link href="/dashboard/crm/leads" className="pv2-button pv2-primary">
        Start with a customer enquiry
      </Link>
    );

  return (
    <div className="pv2-new-project">
      <button
        type="button"
        className="pv2-button pv2-primary"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? 'Close' : '＋ Start Project'}
      </button>
      {expanded && (
        <section
          className="pv2-new-project-panel"
          aria-label="Start a project from an existing customer quotation"
        >
          <h2>Start with a quotation</h2>
          <p className="pv2-muted">
            Select an existing customer and continue a quotation, or create one
            first. The customer’s latest quotation is Final by default. When the
            delivery project is created, its planned milestones sync from that
            quote without recording homeowner acceptance, a signed agreement, or payment.
          </p>
          <label>
            Customer
            <select
              required
              value={customerId}
              onChange={(event) => setCustomerId(event.target.value)}
            >
              {customers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          {quotes.length > 0 ? (
            <div className="pv2-project-quotes" aria-label="Open quotations">
              <strong>Open quotations for {customer?.name ?? 'this customer'}</strong>
              {quotes.map((quote) => (
                <Link
                  key={quote.revisionId}
                  href={'/dashboard/quotations/' + quote.revisionId + '/studio'}
                  className="pv2-button pv2-outline"
                >
                  Continue {quote.number} · {quote.status}
                </Link>
              ))}
            </div>
          ) : (
            <p className="pv2-muted" role="status">
              No draft or issued quotation is linked to this customer yet.
            </p>
          )}
          {canCreateQuote ? (
            <Link href={quoteUrl} className="pv2-button pv2-primary">
              {quotes.length ? '＋ Create another quotation' : '＋ Create quotation'}
              {customer ? ' for ' + customer.name : ''}
            </Link>
          ) : (
            <p className="pv2-muted" role="status">
              Quotation creation permission is required to start a new project.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
