import Link from 'next/link';

export default function Page() {
  return (
    <main id="main-content" tabIndex={-1} className="premium-shell">
      <header className="premium-topbar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            OS
          </span>
          <span>Business OS</span>
        </div>
        <Link className="premium-link-secondary" href="/login">
          Sign in
        </Link>
      </header>

      <section className="home-hero" aria-labelledby="home-title">
        <div>
          <p className="eyebrow">Interior business operations · unified</p>
          <h1 id="home-title" className="hero-title">
            Run the whole business from one calm workspace.
          </h1>
          <p className="hero-copy">
            Business OS brings customers, quotations, finance, execution,
            automation, reports, and team access into one secure operating layer
            built for growing interior businesses.
          </p>
          <div className="hero-actions">
            <Link className="premium-link" href="/dashboard">
              Open dashboard →
            </Link>
            <Link className="premium-link-secondary" href="/login">
              Sign in securely
            </Link>
          </div>
        </div>

        <aside className="feature-panel" aria-label="Business OS highlights">
          <p className="eyebrow">Built for daily operations</p>
          <ul className="feature-list">
            <li>
              <span className="feature-dot" aria-hidden="true" />
              <span>
                <strong>Role-aware access.</strong> Every workspace and module
                follows the user&apos;s organization permissions.
              </span>
            </li>
            <li>
              <span className="feature-dot" aria-hidden="true" />
              <span>
                <strong>One operational view.</strong> Move from lead to
                quotation, delivery, finance, and reporting without tool sprawl.
              </span>
            </li>
            <li>
              <span className="feature-dot" aria-hidden="true" />
              <span>
                <strong>Secure by design.</strong> Authentication and business
                data stay isolated behind Supabase and server-side checks.
              </span>
            </li>
          </ul>
        </aside>
      </section>
    </main>
  );
}
