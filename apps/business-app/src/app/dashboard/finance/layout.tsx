import type { ReactNode } from 'react';
import './finance-home.css';

// Finance owns its navigation; do not render a second commercial breadcrumb
// above the workspace or its existing contract/payment detail routes.
export default function FinanceLayout({ children }: { children: ReactNode }) {
  return children;
}
