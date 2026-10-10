import Link from 'next/link';
import { RecoveryForm } from '@business-os/ui/recovery-form';
import { requestPasswordReset } from '@business-os/auth/recovery-actions';

export default async function ForgotPassword({
  searchParams,
}: {
  searchParams: Promise<{ invited?: string }>;
}) {
  const { invited } = await searchParams;
  return (
    <main id="main-content" tabIndex={-1} className="auth-shell">
      <section className="auth-story" aria-labelledby="recovery-story-title">
        <p className="eyebrow">Account recovery</p>
        <h2 id="recovery-story-title">
          Get back into your workspace securely.
        </h2>
        <p>
          Request a time-limited recovery link for the email address attached to
          your Business OS account.
        </p>
      </section>

      <section className="auth-card" aria-labelledby="recovery-title">
        <p className="eyebrow">Password reset</p>
        <h1 id="recovery-title">Reset your password</h1>
        <p>
          Enter your email address. For security, the response is the same
          whether or not an account exists.
        </p>
        {invited === '1' && (
          <p className="notice notice-success" role="status">
            Your Business OS invitation brought you here. If your email is now
            verified, request a password reset link below to choose your own
            password. You can sign in afterward; company access is assigned
            separately.
          </p>
        )}
        <RecoveryForm action={requestPasswordReset} />
        <div className="auth-links">
          <Link href="/login">← Back to sign in</Link>
        </div>
      </section>
    </main>
  );
}
