'use client';
import { startTransition, useActionState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from './index';
export function AuthForm({
  action,
  registerAccount = false,
}: {
  action: (
    state: { message: string },
    form: FormData,
  ) => Promise<{ message: string }>;
  registerAccount?: boolean;
}) {
  const [state, dispatch, pending] = useActionState(action, { message: '' });
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ email: string; password: string; fullName: string }>();
  return (
    <form
      className="mt-6 grid max-w-md gap-4"
      onSubmit={handleSubmit((values) => {
        const form = new FormData();
        form.set('email', values.email);
        form.set('password', values.password);
        if (registerAccount) form.set('fullName', values.fullName);
        startTransition(() => dispatch(form));
      })}
    >
      {registerAccount && (
        <label>
          Full name
          <input
            className="mt-1 block w-full rounded border p-2"
            autoComplete="name"
            {...register('fullName', { required: true, maxLength: 200 })}
          />
        </label>
      )}
      <label>
        Email
        <input
          className="mt-1 block w-full rounded border p-2"
          type="email"
          autoComplete="email"
          {...register('email', { required: true, maxLength: 254 })}
        />
      </label>
      <label>
        Password
        <input
          className="mt-1 block w-full rounded border p-2"
          type="password"
          autoComplete={registerAccount ? 'new-password' : 'current-password'}
          {...register('password', {
            required: true,
            minLength: registerAccount ? 12 : 1,
            maxLength: 128,
          })}
        />
      </label>
      {Object.keys(errors).length > 0 && (
        <p role="alert">
          Complete all fields. New passwords need at least 12 characters.
        </p>
      )}
      <Button disabled={pending} type="submit">
        {pending
          ? 'Please wait…'
          : registerAccount
            ? 'Create account'
            : 'Sign in'}
      </Button>
      <p role="status">{state.message}</p>
    </form>
  );
}
