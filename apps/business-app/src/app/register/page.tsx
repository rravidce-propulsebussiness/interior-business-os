import Link from 'next/link';
import { AuthForm } from '@business-os/ui/auth-form';
import { signUp } from '@business-os/auth/actions';

export default function Register() {
  return (
    <main id="main-content" tabIndex={-1} className="auth-shell">
      <section className="auth-story" aria-labelledby="register-story-title">
        <p className="eyebrow">Business OS · account onboarding</p>
        <h2 id="register-story-title">Create your secure account.</h2>
        <p>
          Start with an identity, then join an organization through an invitation
          or approved workspace membership.
        </p>
        <ul className="feature-list">
          <li>
            <span className="feature-dot" aria-hidden="true" />
            <span>Account creation alone never grants business access.</span>
          </li>
          <li>
            <span className="feature-dot" aria-hidden="true" />
            <span>Organization permissions remain isolated and role-based.</span>
          </li>
        </ul>
      </section>

      <section className="auth-card" aria-labelledby="register-title">
        <p className="eyebrow">New account</p>
        <h1 id="register-title">Create your account</h1>
        <p>
          Confirm your email before signing in. Workspace access is granted
          separately by an organization administrator.
        </p>
        <AuthForm action={signUp} registerAccount />
        <div className="auth-links">
          <Link href="/login">Already have an account? Sign in</Link>
          <Link href="/">← Back to home</Link>
        </div>
      </section>
    </main>
  );
}
