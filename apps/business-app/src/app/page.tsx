import Link from 'next/link';
import { signOut } from '@business-os/auth/actions';
import {
  createServerDatabase,
  isSupabaseConfigured,
} from '@business-os/database/server';

export const dynamic = 'force-dynamic';

export default async function Page() {
  // Always resolve the current verified session on the server. The landing
  // page must not display guest-only links to signed-in owners/admins.
  const { data: { user } } = isSupabaseConfigured()
    ? await (await createServerDatabase()).auth.getUser()
    : { data: { user: null } };
  const signedIn = Boolean(user);

  return (
    <main id="main-content" tabIndex={-1} className="premium-shell">
      <header className="premium-topbar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            OS
          </span>
          <span>Business OS</span>
        </div>
        {signedIn ? (
          <nav className="premium-account-nav" aria-label="Your account">
            <span className="premium-account-status" title={user?.email ?? undefined}>
              Signed in{user?.email ? ` · ${user.email}` : ''}
            </span>
            <Link className="premium-link-secondary" href="/dashboard">
              Dashboard
            </Link>
            <form action={signOut}>
              <button type="submit" className="premium-link-secondary">
                Sign out
              </button>
            </form>
          </nav>
        ) : (
          <Link className="premium-link-secondary" href="/login">
            Sign in
          </Link>
        )}
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
            {signedIn ? (
              <Link className="premium-link" href="/dashboard">
                Continue to your dashboard →
              </Link>
            ) : (
              <>
                <Link className="premium-link" href="/login">
                  Sign in to your workspace →
                </Link>
                <Link className="premium-link-secondary" href="/register">
                  Create an account
                </Link>
              </>
            )}
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
