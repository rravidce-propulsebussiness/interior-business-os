import Link from 'next/link';
import type { ReactNode } from 'react';
export default function CrmLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <nav
        aria-label="CRM navigation"
        className="mx-auto flex max-w-6xl flex-wrap gap-4 p-6"
      >
        {[
          ['Dashboard', '/dashboard'],
          ['CRM overview', '/dashboard/crm'],
          ['Leads', '/dashboard/crm/leads'],
          ['Pipeline', '/dashboard/crm/pipeline'],
          ['Follow-ups', '/dashboard/crm/followups'],
          ['Site visits', '/dashboard/crm/site-visits'],
          ['CRM configuration', '/dashboard/crm/settings'],
        ].map(([label, href]) => (
          <Link className="min-h-11 py-2 underline" key={href} href={href!}>
            {label}
          </Link>
        ))}
      </nav>
      {children}
    </>
  );
}
