import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
export const metadata: Metadata = {
  title: 'Business websites | Business OS',
  description: 'The future delivery surface for published business websites.',
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: { children: ReactNode }) {
  // Resolve public routes before streaming so missing hosts/pages retain HTTP 404.
  // A root loading boundary would commit HTTP 200 before notFound() can run.
  return (
    <html lang="en">
      <body>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:block focus:p-4"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
