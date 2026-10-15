/* eslint-disable @next/next/no-html-link-for-pages -- Hostinger requires fresh document links after session transitions to avoid interrupted RSC Flight. */
'use client';

import {
  startTransition,
  useActionState,
  useEffect,
  useState,
  type FormEvent,
} from 'react';

export function PremiumLoginForm({
  action,
}: {
  action: (
    state: { message: string; authenticated?: boolean; clientPortal?: boolean },
    form: FormData,
  ) => Promise<{ message: string; authenticated?: boolean; clientPortal?: boolean }>;
}) {
  const [state, dispatch, pending] = useActionState(action, { message: '' });
  const [visible, setVisible] = useState(false);
  const [validation, setValidation] = useState('');

  useEffect(() => {
    if (state.authenticated) {
      // The session is already stored in the secure Supabase cookies.
      // Full-document navigation avoids the hosted RSC Flight #412 problem.
      window.location.replace(
        new URL(state.clientPortal ? '/client' : '/dashboard', window.location.origin).href,
      );
    }
  }, [state.authenticated, state.clientPortal]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const email = String(fields.get('email') ?? '').trim();
    const password = String(fields.get('password') ?? '');
    if (!email || !password) {
      setValidation('Complete all fields to sign in.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setValidation('Enter a valid email address.');
      return;
    }
    setValidation('');
    startTransition(() => dispatch(fields));
  }

  return (
    <form className="pp-login-email-form" onSubmit={submit} noValidate>
      <div className="pp-login-form-field">
        <label htmlFor="pp-login-email">Email</label>
        <div className="pp-login-input-wrap">
          <svg
            aria-hidden="true"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m3 7 9 7 9-7" />
          </svg>
          <input
            id="pp-login-email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="Enter your email address"
            maxLength={254}
            onInput={() => setValidation('')}
          />
        </div>
      </div>
      <div className="pp-login-form-field">
        <div className="pp-login-form-label-row">
          <label htmlFor="pp-login-password">Password</label>
          <a href="/forgot-password">Forgot Password?</a>
        </div>
        <div className="pp-login-input-wrap">
          <svg
            aria-hidden="true"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="5" y="10" width="14" height="11" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
          <input
            id="pp-login-password"
            name="password"
            type={visible ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="Enter your password"
            maxLength={128}
            onInput={() => setValidation('')}
          />
          <button
            type="button"
            className="pp-login-show-password"
            aria-label={visible ? 'Hide password' : 'Show password'}
            onClick={() => setVisible((value) => !value)}
          >
            {visible ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>
      {validation && (
        <p className="pp-login-form-feedback" role="alert">
          {validation}
        </p>
      )}
      {state.message && !validation && (
        <p className="pp-login-form-feedback" role="status">
          {state.message}
        </p>
      )}
      <button
        className="pp-login-submit"
        type="submit"
        disabled={pending || state.authenticated === true}
      >
        <span>
          {pending || state.authenticated ? 'Signing in…' : 'Sign in'}
        </span>
        <svg
          aria-hidden="true"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 12h16m-6-6 6 6-6 6" />
        </svg>
      </button>
      <p className="pp-login-create-account">
        New to ProPulse? <a href="/register">Create an account</a>
      </p>
    </form>
  );
}
