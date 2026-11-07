'use client';

import { useCallback, useEffect, useState } from 'react';
import { readApiResponse } from '@/lib/whatsapp-response';

type Connection = { id: string; name: string; phone: string; status: string };
type Template = {
  id: string;
  name: string;
  status: string;
  category?: string;
  language: string;
  components?: Array<{ type: string; text?: string }>;
};

const fieldClass =
  'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm';

export function WhatsAppWorkspace({
  connections,
}: {
  connections: Connection[];
}) {
  const [connectionId, setConnectionId] = useState(connections[0]?.id ?? '');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [recipient, setRecipient] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [language, setLanguage] = useState('en_US');
  const [parameters, setParameters] = useState('');
  const [optedIn, setOptedIn] = useState(false);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesCheckedAt, setTemplatesCheckedAt] = useState<Date | null>(null);
  const [newName, setNewName] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newCategory, setNewCategory] = useState('UTILITY');

  const loadTemplates = useCallback(
    async (id = connectionId) => {
      if (!id) return;
      setTemplatesLoading(true);
      try {
        const response = await fetch(
          `/api/whatsapp/templates?connectionId=${encodeURIComponent(id)}`,
          { cache: 'no-store' },
        );
        const data = (await readApiResponse(response)) as {
          templates?: Template[];
          message?: string;
        };
        if (!response.ok)
          throw new Error(data.message ?? 'Could not load templates.');
        const list = data.templates ?? [];
        setTemplates(list);
        setTemplatesCheckedAt(new Date());
        const firstApproved = list.find(
          (item) => ['APPROVED', 'ACTIVE'].includes(item.status.toUpperCase()),
        );
        if (firstApproved) {
          setTemplateName(firstApproved.name);
          setLanguage(firstApproved.language);
        }
      } finally {
        setTemplatesLoading(false);
      }
    },
    [connectionId],
  );

  useEffect(() => {
    if (!connectionId) return;
    void Promise.resolve()
      .then(() => loadTemplates())
      .catch((error: unknown) =>
        setNotice(
          error instanceof Error ? error.message : 'Could not load templates.',
        ),
      );
  }, [connectionId, loadTemplates]);

  async function sendTemplate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice('Sending approved template…');
    try {
      const response = await fetch('/api/whatsapp/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId,
          to: recipient,
          templateName,
          language,
          parameters: parameters
            .split('\n')
            .map((value) => value.trim())
            .filter(Boolean),
          recipientHasOptedIn: optedIn,
        }),
      });
      const data = (await readApiResponse(response)) as {
        sent?: boolean;
        messageId?: string;
        message?: string;
      };
      if (!response.ok)
        throw new Error(data.message ?? 'Message could not be sent.');
      setNotice(
        `Meta accepted the message. ID: ${data.messageId ?? 'recorded'}`,
      );
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'Message could not be sent.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function createTemplate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice('Submitting template to Meta for review…');
    try {
      const response = await fetch('/api/whatsapp/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId,
          name: newName,
          category: newCategory,
          language: 'en_US',
          body: newBody,
        }),
      });
      const data = (await readApiResponse(response)) as { message?: string };
      if (!response.ok)
        throw new Error(data.message ?? 'Template could not be submitted.');
      setNewName('');
      setNewBody('');
      setNotice(
        'Template submitted to Meta. Check the review status below; sending unlocks after approval.',
      );
      try {
        await loadTemplates();
      } catch {
        setNotice(
          'Template was submitted to Meta, but its latest status could not be refreshed. Use Refresh status to try again.',
        );
      }
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Template could not be submitted.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (!connections.length) return null;

  return (
    <section className="space-y-5 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-orange-800">
          Messaging
        </p>
        <h2 className="mt-1 text-xl font-semibold">Send a WhatsApp template</h2>
        <p className="mt-1 max-w-3xl text-sm text-neutral-600">
          Use Meta-approved templates for business-initiated messages. Message
          recipients must have opted in.
        </p>
      </div>
      <label className="block max-w-xl space-y-1 text-sm font-medium">
        Connected business number
        <select
          className={fieldClass}
          value={connectionId}
          onChange={(event) => setConnectionId(event.target.value)}
        >
          {connections.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} · {item.phone} ({item.status})
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-5 lg:grid-cols-2">
        <form
          className="space-y-3 rounded-xl border p-4"
          onSubmit={sendTemplate}
        >
          <h3 className="font-semibold">Send approved template</h3>
          <label className="block space-y-1 text-sm">
            Recipient number, international format
            <input
              className={fieldClass}
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              placeholder="+919876543210"
              pattern="\+[1-9]\d{7,14}"
              required
            />
          </label>
          <label className="block space-y-1 text-sm">
            Approved template
            <select
              className={fieldClass}
              value={`${templateName}|${language}`}
              onChange={(event) => {
                const [name, locale] = event.target.value.split('|');
                setTemplateName(name ?? '');
                setLanguage(locale ?? 'en_US');
              }}
              required
            >
              <option value="">Select an approved template</option>
              {templates
                .filter((item) => item.status === 'APPROVED')
                .map((item) => (
                  <option key={item.id} value={`${item.name}|${item.language}`}>
                    {item.name} · {item.language}
                  </option>
                ))}
            </select>
          </label>
          {templateName && (
            <p className="rounded-lg bg-neutral-50 p-3 text-xs text-neutral-600">
              {templates
                .find(
                  (item) =>
                    item.name === templateName && item.language === language,
                )
                ?.components?.find((item) => item.type === 'BODY')?.text ??
                'Template body available in Meta WhatsApp Manager.'}
            </p>
          )}
          <label className="block space-y-1 text-sm">
            Template body values, one per line
            <textarea
              className={fieldClass}
              rows={3}
              value={parameters}
              onChange={(event) => setParameters(event.target.value)}
              placeholder="Only if the approved template has {{1}}, {{2}}, …"
            />
          </label>
          <label className="flex items-start gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              checked={optedIn}
              onChange={(event) => setOptedIn(event.target.checked)}
              required
            />{' '}
            I confirm this recipient opted in to receive WhatsApp messages from
            this business.
          </label>
          <button
            className="rounded-lg bg-[#88352B] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            disabled={busy || !templateName || !optedIn}
          >
            {busy ? 'Working…' : 'Send WhatsApp template'}
          </button>
        </form>

        <form
          className="space-y-3 rounded-xl border p-4"
          onSubmit={createTemplate}
        >
          <h3 className="font-semibold">Create a message template</h3>
          <p className="text-xs text-neutral-600">
            Meta reviews new templates. They are unavailable for sending until
            approved.
          </p>
          <label className="block space-y-1 text-sm">
            Template name
            <input
              className={fieldClass}
              value={newName}
              onChange={(event) =>
                setNewName(
                  event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
                )
              }
              placeholder="appointment_reminder"
              pattern="[a-z0-9_]{3,512}"
              required
            />
          </label>
          <label className="block space-y-1 text-sm">
            Category
            <select
              className={fieldClass}
              value={newCategory}
              onChange={(event) => setNewCategory(event.target.value)}
            >
              <option value="UTILITY">Utility</option>
              <option value="MARKETING">Marketing</option>
              <option value="AUTHENTICATION">Authentication</option>
            </select>
          </label>
          <label className="block space-y-1 text-sm">
            Template message
            <textarea
              className={fieldClass}
              rows={4}
              value={newBody}
              onChange={(event) => setNewBody(event.target.value)}
              placeholder="Hello {{1}}, your appointment is on {{2}}."
              maxLength={1024}
              required
            />
          </label>
          <button
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold disabled:opacity-50"
            disabled={busy}
          >
            {busy ? 'Working…' : 'Submit template to Meta'}
          </button>
        </form>
      </div>
      {notice && (
        <p
          role="status"
          className="rounded-lg bg-neutral-50 p-3 text-sm text-neutral-700"
        >
          {notice}
        </p>
      )}
      <section
        aria-labelledby="whatsapp-template-status"
        className="space-y-4 rounded-xl border border-neutral-200 p-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 id="whatsapp-template-status" className="font-semibold">
              Template approval status
            </h3>
            <p className="mt-1 text-sm text-neutral-600">
              Live status for this connected number, refreshed from Meta.
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-semibold disabled:opacity-50"
            disabled={templatesLoading || busy}
            onClick={() =>
              void loadTemplates().catch((error: unknown) =>
                setNotice(
                  error instanceof Error
                    ? error.message
                    : 'Could not refresh template status.',
                ),
              )
            }
          >
            {templatesLoading ? 'Refreshing…' : 'Refresh status'}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {(
            [
              ['PENDING', 'IN_REVIEW'],
              ['APPROVED', 'ACTIVE'],
              ['REJECTED'],
            ] as string[][]
          ).map((statuses, index) => {
            const labels = ['Pending', 'Approved', 'Rejected'];
            const count = templates.filter((item) =>
              statuses.includes(item.status.toUpperCase()),
            ).length;
            return (
              <span
                key={labels[index]}
                className="rounded-full bg-neutral-100 px-3 py-1.5 font-medium text-neutral-700"
              >
                {labels[index]} · {count}
              </span>
            );
          })}
          <span className="text-neutral-500">
            {templates.length} template{templates.length === 1 ? '' : 's'} from Meta
            {templatesCheckedAt
              ? ` · Updated ${templatesCheckedAt.toLocaleTimeString()}`
              : ''}
          </span>
        </div>
        {templates.length ? (
          <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-100">
            {[...templates]
              .sort((left, right) => left.name.localeCompare(right.name))
              .map((item) => {
                const status = item.status.toUpperCase();
                const label =
                  status === 'APPROVED' || status === 'ACTIVE'
                    ? 'Approved'
                    : status === 'PENDING' || status === 'IN_REVIEW'
                      ? 'Pending'
                      : status.replaceAll('_', ' ').toLowerCase();
                const badgeClass =
                  status === 'APPROVED' || status === 'ACTIVE'
                    ? 'bg-emerald-50 text-emerald-800'
                    : status === 'PENDING' || status === 'IN_REVIEW'
                      ? 'bg-amber-50 text-amber-900'
                      : status === 'REJECTED' || status === 'DISABLED'
                        ? 'bg-rose-50 text-rose-800'
                        : 'bg-neutral-100 text-neutral-700';
                return (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="break-all text-sm font-medium text-neutral-900">
                        {item.name}
                      </p>
                      <p className="mt-0.5 text-xs text-neutral-500">
                        {item.category ?? 'Template'} · {item.language}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClass}`}
                    >
                      {label}
                    </span>
                  </li>
                );
              })}
          </ul>
        ) : (
          <p className="rounded-lg bg-neutral-50 p-3 text-sm text-neutral-600">
            No templates were returned by Meta yet. After submission, select
            Refresh status to check again.
          </p>
        )}
      </section>
      <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-950">
        <strong>Compliance:</strong> Send only to people who consented to
        WhatsApp messages. Meta-approved templates are required for this
        business-initiated flow. You are responsible for honoring opt-outs and
        maintaining consent records.
      </div>
    </section>
  );
}
