'use client';

import { useState } from 'react';
import Link from 'next/link';

type Customer = {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  location?: string;
};
type Quote = { revisionId: string; number: string; status: string };

/** Start from an existing customer record, or begin a quote for a new customer. */
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
  const quotes = customerId ? (quotesByCustomer[customerId] ?? []) : [];
  const quoteUrl = customerId
    ? '/dashboard/quotations/new?customer=' + encodeURIComponent(customerId)
    : '/dashboard/quotations/new';

  return (
    <div className="pv2-new-project">
      <button
        type="button"
        className="pv2-button pv2-primary"
        aria-expanded={expanded}
        aria-controls="pv2-create-project-panel"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? 'Close project setup' : '＋ Create Project'}
      </button>
      {expanded && (
        <section
          id="pv2-create-project-panel"
          className="pv2-new-project-panel"
          aria-label="Create project"
        >
          <h2>Select a customer</h2>
          <p className="pv2-muted">
            Review the customer’s saved details and quotations. A delivery
            project starts from the customer’s accepted quotation and agreement.
          </p>
          {customers.length ? (
            <>
              <label className="pv2-project-customer-select">
                Existing customer
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
              {customer && (
                <div
                  className="pv2-project-customer-details"
                  aria-label="Customer details"
                >
                  <strong>{customer.name}</strong>
                  <span>{customer.phone || 'No phone number saved'}</span>
                  <span>{customer.email || 'No email saved'}</span>
                  {customer.location && <span>{customer.location}</span>}
                </div>
              )}
              {quotes.length > 0 ? (
                <div
                  className="pv2-project-quotes"
                  aria-label="Open quotations"
                >
                  <strong>
                    Open quotations for {customer?.name ?? 'this customer'}
                  </strong>
                  {quotes.map((quote) => (
                    <Link
                      key={quote.revisionId}
                      href={
                        '/dashboard/quotations/' + quote.revisionId + '/studio'
                      }
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
                  {quotes.length
                    ? '＋ Create another quotation'
                    : '＋ Create quotation'}
                  {customer ? ' for ' + customer.name : ''}
                </Link>
              ) : (
                <p className="pv2-muted" role="status">
                  Quotation creation permission is required to continue.
                </p>
              )}
            </>
          ) : (
            <p className="pv2-muted" role="status">
              No existing customer records are available. Start a quotation for
              a new customer enquiry.
            </p>
          )}
          <div className="pv2-new-customer-quote">
            <span>New customer?</span>
            {canCreateQuote ? (
              <Link
                href="/dashboard/quotations/new"
                className="pv2-button pv2-outline"
              >
                Create a quotation
              </Link>
            ) : (
              <span className="pv2-muted">
                Quotation creation permission is required.
              </span>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
