import type { ReactNode } from 'react';

/**
 * The protected CRM owner pages render their own unified workspace shell.
 * Do not prepend another legacy nav bar above them.
 */
export default function CrmLayout({ children }: { children: ReactNode }) {
  return children;
}
