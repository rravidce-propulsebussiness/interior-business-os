'use client';
import { startTransition, useActionState, useRef, type FormEvent } from 'react';
import { saveGstDocument } from './actions';

export function useInvoiceSave() {
  const inFlight = useRef(false);
  const [state, saveAction, pending] = useActionState(
    async (_state: { message: string }, form: FormData) => {
      try {
        return await saveGstDocument(form);
      } finally {
        inFlight.current = false;
      }
    },
    { message: '' },
  );
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    // Manual dispatch avoids React resetting uncontrolled fields when the
    // server action returns a validation error. Keep native form validation.
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    const form = new FormData(event.currentTarget);
    startTransition(() => saveAction(form));
  }
  return { saveAction, onSubmit, pending, message: state.message };
}
