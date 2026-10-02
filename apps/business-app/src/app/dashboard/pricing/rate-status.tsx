'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@business-os/ui';
import { changeRateStatus } from '../catalog/actions';
export function RateStatus({
  org,
  id,
  version,
  status,
}: {
  org: string;
  id: string;
  version: number;
  status: 'active' | 'inactive';
}) {
  const [message, setMessage] = useState(''),
    [pending, startTransition] = useTransition(),
    router = useRouter();
  return (
    <div className="my-4">
      <Button
        disabled={pending}
        onClick={() => {
          if (
            status === 'active' &&
            !window.confirm(
              'Deactivate this rate? New previews will no longer use it.',
            )
          )
            return;
          startTransition(async () => {
            const result = await changeRateStatus(
              org,
              id,
              version,
              status === 'active' ? 'inactive' : 'active',
            );
            setMessage(result.message);
            router.refresh();
          });
        }}
      >
        {pending
          ? 'Saving…'
          : status === 'active'
            ? 'Deactivate rate'
            : 'Reactivate rate'}
      </Button>
      <p role="status">{message}</p>
    </div>
  );
}
