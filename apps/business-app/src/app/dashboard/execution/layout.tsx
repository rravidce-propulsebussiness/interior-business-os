import Link from 'next/link';
import type { ReactNode } from 'react';
export default function ExecutionLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <nav
        aria-label="Execution workspace"
        className="mx-auto flex max-w-6xl flex-wrap gap-4 px-6 pt-6"
      >
        <Link href="/dashboard/projects">Projects</Link>
        <Link href="/dashboard/execution">Execution overview</Link>
      </nav>
      {children}
    </>
  );
}
