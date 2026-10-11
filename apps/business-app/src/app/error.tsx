'use client';
import { ErrorState } from '@business-os/ui';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // #412 is React's "Connection closed" from an incomplete Flight stream.
  // A fresh HTML navigation is safer than repeatedly retrying that stream.
  const interrupted =
    error.message.includes('Connection closed') ||
    error.message.includes('error #412');
  if (interrupted) {
    return (
      <main
        id="main-content"
        className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center gap-5 px-6 text-center"
      >
        <h1 className="text-2xl font-semibold">Connection interrupted</h1>
        <p className="text-sm leading-6">
          This page did not finish loading. Your account is still protected.
          Reload the page to request a fresh copy.
        </p>
        <button
          type="button"
          className="rounded-xl bg-sky-500 px-6 py-3 font-semibold text-slate-950"
          onClick={() => window.location.reload()}
        >
          Reload page
        </button>
      </main>
    );
  }
  return <ErrorState reset={reset} />;
}
