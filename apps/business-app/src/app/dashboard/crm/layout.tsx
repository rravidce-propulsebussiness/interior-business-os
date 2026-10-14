import Link from 'next/link';
import type { ReactNode } from 'react';
export default function CrmLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <nav
        aria-label="CRM navigation"
        className="crm-shared-navigation mx-auto flex max-w-6xl flex-wrap gap-4 p-6"
      >
        {[
          ['Dashboard', '/dashboard'],
          ['CRM Overview', '/dashboard/crm'],
          ['All Leads · Follow-ups · Site Visits', '/dashboard/crm/leads'],
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
