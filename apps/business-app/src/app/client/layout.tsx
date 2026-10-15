import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'My Projects | ProPulse Client',
  description: 'Private construction and interior project updates, progress photos, and drawing approvals.',
  robots: { index: false, follow: false },
};

export default function ClientLayout({ children }: { children: ReactNode }) {
  return children;
}
