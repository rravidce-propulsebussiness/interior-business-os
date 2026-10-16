'use client';

import { useId, useState, type ReactNode } from 'react';
import Link from 'next/link';

/** The More panel is a separate grid row. It cannot stretch Share into a tall
 * empty button or cover the customer's other quotations. */
export function QuotationMobileMore({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <>
      <button type="button" className="qs-quotes-action qs-quotes-more-trigger"
        aria-expanded={open} aria-controls={id}
        onClick={() => setOpen((value) => !value)}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5" cy="12" r="1.75"/><circle cx="12" cy="12" r="1.75"/><circle cx="19" cy="12" r="1.75"/>
        </svg>
        More
      </button>
      {open && (
        <div id={id} className="qs-quotes-mobile-more-panel" role="group" aria-label="More quotation actions">
          {children}
        </div>
      )}
    </>
  );
}

/** Existing quote history is collapsed until explicitly requested. The PDF
 * action remains outside the disclosure so it never overlaps expanded quotes. */
export function QuotationMobileFooter({
  count, pdfHref, children,
}: {
  count: number;
  pdfHref: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="qs-quotes-footer-block">
      <div className="qs-quotes-mobile-card-footer">
        {count > 1 && (
          <button type="button" className="qs-quotes-history-toggle"
            aria-expanded={open} aria-controls={id}
            onClick={() => setOpen((value) => !value)}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3h10v15H8zM5 6H3v15h12v-2M11 9h4M11 13h4"/>
            </svg>
            <span>View all quotations ({count})</span>
            <svg aria-hidden="true" className={'qs-quotes-history-chevron' + (open ? ' is-open' : '')}
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m9 6 6 6-6 6"/>
            </svg>
          </button>
        )}
        <Link className="qs-quotes-mobile-pdf" href={pdfHref}
          target="_blank" rel="noopener noreferrer">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 2h9l5 5v15H5zM14 2v6h5M8 13h8M8 17h8"/>
          </svg>
          View PDF
        </Link>
      </div>
      {count > 1 && open && (
        <div id={id} className="qs-quotes-past-list qs-quotes-mobile-expanded">
          {children}
        </div>
      )}
    </div>
  );
}
