'use client';
import { useActionState } from 'react';
import type { ReactNode } from 'react';
import { Button } from './index';
export function ActionForm({
  action,
  label,
  children,
}: {
  action: (
    state: { message: string },
    form: FormData,
  ) => Promise<{ message: string }>;
  label: string;
  children: ReactNode;
}) {
  const [state, dispatch, pending] = useActionState(action, { message: '' });
  return (
    <form action={dispatch} className="my-6 grid max-w-xl gap-4">
      {children}
      <Button disabled={pending} type="submit">
        {pending ? 'Saving…' : label}
      </Button>
      <p role="status">{state.message}</p>
    </form>
  );
}
