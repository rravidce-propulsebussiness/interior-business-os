import Link from 'next/link';
import type { ReactNode } from 'react';
export default function FinanceLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <nav
        aria-label="Commercial workspace"
        className="mx-auto flex max-w-6xl flex-wrap gap-4 px-6 pt-6"
      >
        <Link href="/dashboard">Dashboard</Link>
        <Link href="/dashboard/finance">Commercial overview</Link>
      </nav>
      {children}
    </>
  );
}
