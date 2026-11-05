'use client';

import { useState } from 'react';

export function WhatsAppTestSender({ configured }: { configured: boolean }) {
  const [recipient, setRecipient] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('Sending Meta test template…');
    try {
      const response = await fetch('/api/whatsapp/test-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: recipient, confirmTestRecipient: confirmed }),
      });
      const result = await response.json() as { message?: string; messageId?: string };
      if (!response.ok) throw new Error(result.message ?? 'Meta test message failed.');
      setMessage(`Meta accepted hello_world. Message ID: ${result.messageId ?? 'accepted'}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Meta test message failed.');
    } finally {
      setBusy(false);
    }
  }

  return <section className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-6">
    <div>
      <p className="text-sm font-semibold uppercase tracking-wide text-emerald-800">Meta developer sandbox</p>
      <h2 className="mt-1 text-xl font-semibold">Send from the Meta test number</h2>
      <p className="mt-1 max-w-3xl text-sm text-neutral-700">Sends Meta’s pre-approved <code>hello_world</code> template from your test sender. Only numbers on both Meta’s test-recipient list and the server allowlist can receive it.</p>
    </div>
    {!configured && <p className="rounded-lg bg-white p-3 text-sm text-amber-900">Add <code>WHATSAPP_TEST_PHONE_NUMBER_ID</code>, <code>WHATSAPP_TEST_ACCESS_TOKEN</code>, and <code>WHATSAPP_TEST_RECIPIENTS</code> in Hostinger to enable test delivery. Keep the token server-side.</p>}
    <form className="max-w-xl space-y-3" onSubmit={send}>
      <label className="block space-y-1 text-sm font-medium">Approved test recipient, international format
        <input className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm" value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="+919000000000" pattern="\+[1-9]\d{7,14}" required />
      </label>
      <label className="flex items-start gap-2 text-sm text-neutral-700"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} required />I confirm this is my approved Meta test recipient and want to send the test template.</label>
      <button className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={!configured || busy || !confirmed}>{busy ? 'Sending…' : 'Send test message'}</button>
      {message && <p role="status" className="text-sm text-neutral-700">{message}</p>}
    </form>
  </section>;
}
