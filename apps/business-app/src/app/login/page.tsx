import Link from 'next/link';
import { AuthForm } from '@business-os/ui/auth-form';
import { signIn } from '@business-os/auth/actions';
import { isSupabaseConfigured } from '@business-os/database/server';

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ recovery?: string }>;
}) {
  const params = await searchParams;
  const recoveryComplete = params.recovery === 'complete';

  return (
    <main id="main-content" tabIndex={-1} className="auth-shell">
      <section className="auth-story" aria-labelledby="auth-story-title">
        <p className="eyebrow">Business OS · secure workspace</p>
        <h2 id="auth-story-title">
          Everything your team needs. Nothing they do not.
        </h2>
        <p>
          Sign in to your organization workspace to access the modules,
          permissions, reporting, and operational tools assigned to your role.
        </p>
        <ul className="feature-list">
          <li>
            <span className="feature-dot" aria-hidden="true" />
            <span>Organization-scoped access with role-aware permissions.</span>
          </li>
          <li>
            <span className="feature-dot" aria-hidden="true" />
            <span>
              Fast handoff between customers, finance, delivery, and reporting.
            </span>
          </li>
          <li>
            <span className="feature-dot" aria-hidden="true" />
            <span>Secure sessions powered by Supabase authentication.</span>
          </li>
        </ul>
      </section>

      <section className="auth-card" aria-labelledby="login-title">
        <p className="eyebrow">Welcome back</p>
        <h1 id="login-title">Sign in</h1>
        <p>Use the email and password assigned to your Business OS account.</p>

        {recoveryComplete && (
          <p className="notice notice-success" role="status">
            Your password was updated successfully. Sign in with the new
            password.
          </p>
        )}

        {!isSupabaseConfigured() && (
          <p className="notice notice-warning" role="status">
            Authentication setup is required before sign-in is available.
          </p>
        )}

        <AuthForm action={signIn} />

        <div className="auth-links">
          <Link href="/forgot-password">Forgot your password?</Link>
          <Link href="/register">Create an account</Link>
        </div>
        <div className="auth-links">
          <Link href="/">← Back to home</Link>
        </div>
      </section>
    </main>
  );
}
