'use client';

import { useSelectedLayoutSegment } from 'next/navigation';

// The overview owns its full-width company shell. Keep the original content
// frame for every deeper Operations route, so existing forms and tables retain
// their established spacing and behavior.
export default function OperationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const segment = useSelectedLayoutSegment();
  if (segment === null) return <>{children}</>;
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto max-w-6xl p-4 md:p-6"
    >
      {children}
    </main>
  );
}
