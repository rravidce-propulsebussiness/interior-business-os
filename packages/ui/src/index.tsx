import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function Button({
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-4 disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}

export function FoundationPage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto min-h-screen max-w-5xl px-6 py-16 sm:py-24"
    >
      <p className="mb-8 text-sm font-semibold tracking-widest text-muted-foreground">
        BUSINESS OS · FOUNDATION
      </p>
      <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
        {title}
      </h1>
      <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
        {description}
      </p>
      <section
        aria-labelledby="foundation-status"
        className="mt-12 rounded-xl border border-border bg-card p-6 sm:p-8"
      >
        <h2 id="foundation-status" className="text-xl font-semibold">
          Business OS foundation
        </h2>
        <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">
          This application uses the shared Business OS foundation. Account
          access and enabled modules determine the available tools. Business
          features will be introduced in subsequent phases.
        </p>
      </section>
      {children}
    </main>
  );
}

export function StatusPage({
  title,
  message,
  busy = false,
}: {
  title: string;
  message: string;
  busy?: boolean;
}) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      aria-busy={busy}
      className="mx-auto min-h-screen max-w-3xl px-6 py-20"
    >
      <h1 className="text-3xl font-semibold">{title}</h1>
      <p
        role={busy ? 'status' : undefined}
        className="mt-4 text-muted-foreground"
      >
        {message}
      </p>
    </main>
  );
}

export function ErrorState({ reset }: { reset: () => void }) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto min-h-screen max-w-3xl px-6 py-20"
    >
      <h1 className="text-3xl font-semibold">Unable to load this page</h1>
      <p role="alert" className="my-6">
        Please try again. If the problem continues, contact support.
      </p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
