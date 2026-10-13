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
          Create a verified account, then set up your own company workspace and
          explore the Business OS tools.
        </p>
        <ul className="feature-list">
          <li>
            <span className="feature-dot" aria-hidden="true" />
            <span>
              Start your own workspace without waiting for an invitation.
            </span>
          </li>
          <li>
            <span className="feature-dot" aria-hidden="true" />
            <span>
              Organization permissions remain isolated and role-based.
            </span>
          </li>
        </ul>
      </section>

      <section className="auth-card" aria-labelledby="register-title">
        <p className="eyebrow">New account</p>
        <h1 id="register-title">Create your account</h1>
        <p>
          Confirm your email, sign in, and create your company workspace.
          Employee accounts can join their team's workspace by invitation.
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
