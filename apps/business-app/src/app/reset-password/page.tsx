import Link from 'next/link';
import { RecoveryForm } from '@business-os/ui/recovery-form';
import { setRecoveryPassword } from '@business-os/auth/recovery-actions';
import { pendingRecovery } from '@business-os/auth/recovery-server';

export default async function ResetPassword() {
  const pending = await pendingRecovery();

  return (
    <main id="main-content" tabIndex={-1} className="auth-shell">
      <section className="auth-story" aria-labelledby="reset-story-title">
        <p className="eyebrow">Account recovery</p>
        <h2 id="reset-story-title">Choose a new secure password.</h2>
        <p>
          Recovery links are short-lived and can only be used for the account
          that requested them.
        </p>
      </section>

      <section className="auth-card" aria-labelledby="reset-title">
        <p className="eyebrow">New password</p>
        <h1 id="reset-title">Set a new password</h1>
        {pending ? (
          <p>
            The recovery link will be verified when you submit. You will need to
            sign in again after the password changes.
          </p>
        ) : (
          <p className="notice notice-warning">
            This reset link is unavailable or expired.{' '}
            <Link href="/forgot-password">Request a new reset link</Link>.
          </p>
        )}
        <RecoveryForm
          action={setRecoveryPassword}
          setPassword
          available={Boolean(pending)}
        />
        <div className="auth-links">
          <Link href="/login">← Back to sign in</Link>
        </div>
      </section>
    </main>
  );
}
