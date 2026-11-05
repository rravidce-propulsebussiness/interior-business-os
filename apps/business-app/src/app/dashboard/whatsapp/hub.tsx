'use client';

import { useCallback, useEffect, useState } from 'react';

type Connection = { id: string; name: string; phone: string; status: string };
type Template = {
  id: string;
  name: string;
  status: string;
  category?: string;
  language: string;
  components?: Array<{ type: string; text?: string }>;
};
type Contact = {
  id: string;
  wa_id: string;
  name: string;
  opted_out: boolean;
  template_opted_in_at?: string | null;
  template_opt_in_source?: string;
  unread?: boolean;
  last_message_at: string;
  last_message: string;
  last_direction: string;
  last_status: string;
};
type Message = {
  id: string;
  provider_id: string;
  direction: 'inbound' | 'outbound';
  type: string;
  body: string;
  status: string;
  error_code: string;
  occurred_at: string;
};
type Rule = {
  id: string;
  version: number;
  connection_id: string;
  name: string;
  trigger_type: 'any_message' | 'keyword';
  keyword: string;
  reply_text: string;
  status: 'active' | 'paused';
};
type Tab = 'inbox' | 'contacts' | 'automations' | 'templates';

const field =
  'w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-sm text-stone-900 outline-none transition focus:border-[#BD5C3F] focus:ring-4 focus:ring-[#BD5C3F]/10';
const primaryButton =
  'rounded-xl bg-[#88352B] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#6f2b23] disabled:cursor-not-allowed disabled:opacity-50';
const softButton =
  'rounded-xl border border-stone-200 bg-white px-3.5 py-2 text-sm font-semibold text-stone-700 transition hover:border-[#BD5C3F] hover:text-[#88352B] disabled:opacity-50';

const starterTemplates = [
  {
    name: 'sg_homes_enquiry_acknowledgement',
    title: 'New enquiry received',
    category: 'UTILITY',
    body: 'Hi {{1}}, thanks for contacting {{2}}. Our team will get back to you shortly.',
    note: 'Acknowledge a new customer enquiry.',
  },
  {
    name: 'sg_homes_site_visit_confirm',
    title: 'Site visit confirmation',
    category: 'UTILITY',
    body: 'Hi {{1}}, your site visit with {{2}} is confirmed for {{3}} at {{4}}. Reply here if you need to reschedule.',
    note: 'Confirm a booked visit with the customer.',
  },
  {
    name: 'sg_homes_quotation_ready',
    title: 'Quotation ready',
    category: 'UTILITY',
    body: 'Hi {{1}}, your quotation for {{2}} is ready. Our team is available if you have any questions.',
    note: 'Notify a customer that a requested quote is ready.',
  },
  {
    name: 'sg_homes_appointment_reminder',
    title: 'Appointment reminder',
    category: 'UTILITY',
    body: 'Reminder: your appointment with {{1}} is scheduled for {{2}}. Reply here if you need to change the time.',
    note: 'Send a reminder for an existing appointment.',
  },
  {
    name: 'sg_homes_project_update',
    title: 'Project update',
    category: 'UTILITY',
    body: 'Hi {{1}}, here is an update on your {{2}} project: {{3}}. Contact your project coordinator if you need more details.',
    note: 'Share a requested service or project update.',
  },
  {
    name: 'sg_homes_follow_up',
    title: 'Enquiry follow-up',
    category: 'UTILITY',
    body: 'Hi {{1}}, we are following up on your enquiry about {{2}}. Reply if you would like our team to assist.',
    note: 'A neutral follow-up; use only when the recipient expects it.',
  },
];

function readableDate(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? '—'
    : new Intl.DateTimeFormat('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
}

function friendlyError(value: unknown, fallback: string) {
  return value instanceof Error ? value.message : fallback;
}

export function WhatsAppHub({
  connections,
  canManage,
}: {
  connections: Connection[];
  canManage: boolean;
}) {
  const [tab, setTab] = useState<Tab>('inbox');
  const [connectionId, setConnectionId] = useState(connections[0]?.id ?? '');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [notice, setNotice] = useState('');

  const loadTemplates = useCallback(async () => {
    if (!connectionId) return;
    const response = await fetch(
      `/api/whatsapp/templates?connectionId=${encodeURIComponent(connectionId)}`,
      { cache: 'no-store' },
    );
    const result = (await response.json()) as {
      templates?: Template[];
      message?: string;
    };
    if (!response.ok)
      throw new Error(result.message ?? 'Could not load templates.');
    setTemplates(result.templates ?? []);
  }, [connectionId]);

  useEffect(() => {
    if (!connectionId) return;
    void loadTemplates().catch((error: unknown) =>
      setNotice(friendlyError(error, 'Could not load WhatsApp templates.')),
    );
  }, [connectionId, loadTemplates]);

  const tabs: Array<{ id: Tab; label: string; detail: string }> = [
    { id: 'inbox', label: 'Inbox', detail: 'Messages and replies' },
    { id: 'contacts', label: 'Contacts', detail: 'Saved recipients and consent' },
    { id: 'automations', label: 'Automations', detail: 'Automatic replies' },
    {
      id: 'templates',
      label: 'Templates',
      detail: 'Approved and starter templates',
    },
  ];

  if (!connections.length) return null;

  return (
    <section className="overflow-hidden rounded-[28px] border border-stone-200 bg-white shadow-[0_18px_55px_-36px_rgba(67,37,31,.45)]">
      <div className="border-b border-stone-200 bg-gradient-to-r from-[#fffaf7] via-white to-[#fff5ef] px-5 py-6 sm:px-7">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.18em] text-[#BD5C3F]">
              ProPulse messaging
            </p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-[#44231f]">
              WhatsApp workspace
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-stone-600">
              Keep customer conversations, contacts, approved templates and
              automatic replies together.
            </p>
          </div>
          <label className="block w-full space-y-1 text-xs font-semibold text-stone-600 xl:max-w-sm">
            Connected business number
            <select
              className={field}
              value={connectionId}
              onChange={(event) => setConnectionId(event.target.value)}
            >
              {connections.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.phone} · {item.status}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <nav
        className="flex gap-1 overflow-x-auto border-b border-stone-200 px-4 py-2 sm:px-6"
        aria-label="WhatsApp workspace"
      >
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setTab(item.id);
              setNotice('');
            }}
            aria-current={tab === item.id ? 'page' : undefined}
            className={`whitespace-nowrap rounded-xl px-4 py-2.5 text-left transition ${tab === item.id ? 'bg-[#88352B] text-white shadow-sm' : 'text-stone-600 hover:bg-stone-100'}`}
          >
            <span className="block text-sm font-semibold">{item.label}</span>
            <span
              className={`hidden text-[11px] sm:block ${tab === item.id ? 'text-white/75' : 'text-stone-400'}`}
            >
              {item.detail}
            </span>
          </button>
        ))}
      </nav>

      <div className="p-4 sm:p-6">
        {tab === 'inbox' && (
          <InboxPanel connectionId={connectionId} canManage={canManage} />
        )}
        {tab === 'contacts' && (
          <ContactsPanel connectionId={connectionId} canManage={canManage} />
        )}
        {tab === 'automations' && (
          <AutomationsPanel connectionId={connectionId} canManage={canManage} />
        )}
        {tab === 'templates' && (
          <TemplatesPanel
            connectionId={connectionId}
            canManage={canManage}
            templates={templates}
            loadTemplates={loadTemplates}
            notice={notice}
            setNotice={setNotice}
          />
        )}
      </div>
    </section>
  );
}

function useWorkspaceRows(section: 'inbox' | 'contacts', connectionId: string) {
  const [rows, setRows] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [unread, setUnread] = useState(0);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!connectionId) return;
    setBusy(true);
    try {
      const params = new URLSearchParams({ section, connectionId, search });
      const response = await fetch(`/api/whatsapp/inbox?${params}`, {
        cache: 'no-store',
      });
      const data = (await response.json()) as {
        rows?: Contact[];
        total?: number;
        unread?: number;
        message?: string;
      };
      if (!response.ok)
        throw new Error(data.message ?? 'Could not load contacts.');
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
      setUnread(data.unread ?? 0);
      setError('');
    } catch (cause) {
      setError(friendlyError(cause, 'Could not load WhatsApp data.'));
    } finally {
      setBusy(false);
    }
  }, [connectionId, search, section]);
  useEffect(() => {
    void load();
  }, [load]);
  return { rows, total, unread, search, setSearch, busy, error, reload: load };
}

function InboxPanel({
  connectionId,
  canManage,
}: {
  connectionId: string;
  canManage: boolean;
}) {
  const state = useWorkspaceRows('inbox', connectionId);
  const [selected, setSelected] = useState('');
  const [thread, setThread] = useState<Message[]>([]);
  const [contact, setContact] = useState<Contact | null>(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const loadThread = useCallback(
    async (waId: string) => {
      if (!waId) return;
      const params = new URLSearchParams({
        section: 'thread',
        connectionId,
        waId,
      });
      const response = await fetch(`/api/whatsapp/inbox?${params}`, {
        cache: 'no-store',
      });
      const data = (await response.json()) as {
        rows?: Message[];
        contact?: Contact;
        message?: string;
      };
      if (!response.ok)
        throw new Error(data.message ?? 'Could not open conversation.');
      setThread(data.rows ?? []);
      setContact(data.contact ?? null);
    },
    [connectionId],
  );

  useEffect(() => {
    const first = state.rows.at(0);
    if (!selected && first) setSelected(first.wa_id);
    if (selected && !state.rows.some((row) => row.wa_id === selected))
      setSelected('');
  }, [selected, state.rows]);
  useEffect(() => {
    if (selected)
      void loadThread(selected).catch((error: unknown) =>
        setNotice(friendlyError(error, 'Could not open conversation.')),
      );
  }, [loadThread, selected]);

  async function markRead(waId: string) {
    await fetch('/api/whatsapp/inbox', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'read', connectionId, waId }),
    });
    await state.reload();
  }

  async function sendReply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!contact || !body.trim()) return;
    setBusy(true);
    setNotice('Sending reply…');
    try {
      const response = await fetch('/api/whatsapp/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageType: 'text',
          connectionId,
          to: `+${contact.wa_id}`,
          body: body.trim(),
        }),
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok)
        throw new Error(result.message ?? 'Reply could not be sent.');
      setBody('');
      setNotice('Reply sent.');
      await loadThread(contact.wa_id);
      await state.reload();
    } catch (error) {
      setNotice(friendlyError(error, 'Reply could not be sent.'));
    } finally {
      setBusy(false);
    }
  }

  async function changeOptOut() {
    if (!contact) return;
    setBusy(true);
    try {
      const response = await fetch('/api/whatsapp/inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'opt_out',
          connectionId,
          waId: contact.wa_id,
        }),
      });
      if (!response.ok)
        throw new Error('Could not update contact consent state.');
      await loadThread(contact.wa_id);
      await state.reload();
      setNotice(
        'Contact marked opted out. Automated and business-initiated messages are blocked until the contact sends START.',
      );
    } catch (error) {
      setNotice(friendlyError(error, 'Could not update contact.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-[560px] overflow-hidden rounded-2xl border border-stone-200 lg:grid-cols-[330px_minmax(0,1fr)]">
      <aside className="flex min-h-[360px] flex-col border-b border-stone-200 bg-stone-50/70 lg:border-b-0 lg:border-r">
        <div className="border-b border-stone-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-stone-900">Conversations</h3>
              <p className="mt-1 text-xs text-stone-500">
                {state.total} contacts · {state.unread} unread
              </p>
            </div>
            <button
              type="button"
              className={softButton}
              onClick={() => void state.reload()}
              disabled={state.busy}
            >
              Refresh
            </button>
          </div>
          <input
            className={`${field} mt-3`}
            value={state.search}
            onChange={(event) =>
              setStateSearch(state.setSearch, event.target.value)
            }
            placeholder="Search name or number"
            aria-label="Search conversations"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {state.busy && (
            <p className="p-5 text-sm text-stone-500">Loading conversations…</p>
          )}
          {!state.busy && state.rows.length === 0 && (
            <div className="p-6">
              <p className="font-semibold text-stone-800">
                Your inbox is ready
              </p>
              <p className="mt-2 text-sm leading-6 text-stone-500">
                Incoming WhatsApp messages will appear here with the sender’s
                name, conversation history and reply window.
              </p>
            </div>
          )}
          {state.rows.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => {
                setSelected(row.wa_id);
                if (canManage) void markRead(row.wa_id);
              }}
              className={`block w-full border-b border-stone-100 px-4 py-3 text-left transition ${selected === row.wa_id ? 'bg-white shadow-[inset_3px_0_0_#88352B]' : 'hover:bg-white'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold text-stone-900">
                  {row.name || `+${row.wa_id}`}
                </span>
                <span className="shrink-0 text-[10px] text-stone-400">
                  {readableDate(row.last_message_at)}
                </span>
              </div>
              <p className="mt-1 truncate text-xs text-stone-500">
                {row.last_direction === 'outbound' ? 'You: ' : ''}
                {row.last_message || 'No message text'}
              </p>
              <div className="mt-2 flex items-center gap-2">
                {row.unread && (
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                )}
                <span className="text-[10px] text-stone-400">+{row.wa_id}</span>
                {row.opted_out && (
                  <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                    Opted out
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </aside>
      <div className="flex min-h-[520px] min-w-0 flex-col bg-[#fbfaf8]">
        {!selected || !contact ? (
          <div className="m-auto max-w-sm px-6 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#f8e9e3] text-2xl">
              ✉
            </div>
            <h3 className="mt-4 font-bold text-stone-900">
              Select a conversation
            </h3>
            <p className="mt-1 text-sm leading-6 text-stone-500">
              Choose a customer on the left to read messages and reply.
            </p>
          </div>
        ) : (
          <>
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 bg-white px-5 py-4">
              <div>
                <h3 className="font-bold text-stone-900">
                  {contact.name || `+${contact.wa_id}`}
                </h3>
                <p className="mt-0.5 text-xs text-stone-500">
                  +{contact.wa_id} · last activity{' '}
                  {readableDate(contact.last_message_at)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${contact.opted_out ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}
                >
                  {contact.opted_out ? 'Opted out' : 'Service replies enabled'}
                </span>
                {canManage && !contact.opted_out && (
                  <button
                    className={softButton}
                    type="button"
                    disabled={busy}
                    onClick={() => void changeOptOut()}
                  >
                    Opt out
                  </button>
                )}
              </div>
            </header>
            <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-6">
              {thread.length === 0 && (
                <p className="rounded-xl bg-white p-4 text-sm text-stone-500">
                  No messages in this conversation yet.
                </p>
              )}
              {thread.map((item) => (
                <div
                  key={item.id}
                  className={`flex ${item.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
                >
                  <article
                    className={`max-w-[min(78%,560px)] rounded-2xl px-4 py-3 shadow-sm ${item.direction === 'outbound' ? 'rounded-br-md bg-[#88352B] text-white' : 'rounded-bl-md border border-stone-200 bg-white text-stone-800'}`}
                  >
                    <p className="whitespace-pre-wrap break-words text-sm leading-6">
                      {item.body}
                    </p>
                    <p
                      className={`mt-2 text-[10px] ${item.direction === 'outbound' ? 'text-white/65' : 'text-stone-400'}`}
                    >
                      {item.direction === 'outbound'
                        ? `${item.status}${item.error_code ? ` · ${item.error_code}` : ''}`
                        : item.type}{' '}
                      · {readableDate(item.occurred_at)}
                    </p>
                  </article>
                </div>
              ))}
            </div>
            <form
              onSubmit={sendReply}
              className="border-t border-stone-200 bg-white p-4"
            >
              {!canManage ? (
                <p className="rounded-xl bg-stone-50 p-3 text-sm text-stone-600">
                  You have view access. Ask an administrator with WhatsApp
                  management access to reply.
                </p>
              ) : contact.opted_out ? (
                <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">
                  This contact opted out. Re-enable only when the customer has
                  asked to resume messages.
                </p>
              ) : (
                <>
                  <label className="sr-only" htmlFor="whatsapp-reply">
                    Write a WhatsApp reply
                  </label>
                  <textarea
                    id="whatsapp-reply"
                    className={field}
                    rows={3}
                    maxLength={4096}
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    placeholder="Write a reply…"
                  />
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-stone-500">
                      Free-form replies work within 24 hours of the customer’s
                      latest message.
                    </p>
                    <button
                      className={primaryButton}
                      disabled={busy || !body.trim()}
                    >
                      {busy ? 'Sending…' : 'Send reply'}
                    </button>
                  </div>
                </>
              )}
            </form>
          </>
        )}
        {(notice || state.error) && (
          <p
            role="status"
            className="border-t border-stone-200 bg-amber-50 px-4 py-2 text-sm text-amber-900"
          >
            {notice || state.error}
          </p>
        )}
      </div>
    </div>
  );
}

function setStateSearch(set: (value: string) => void, value: string) {
  set(value);
}

function ContactsPanel({
  connectionId,
  canManage,
}: {
  connectionId: string;
  canManage: boolean;
}) {
  const state = useWorkspaceRows('contacts', connectionId);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [consentSource, setConsentSource] = useState('');
  const [confirmOptIn, setConfirmOptIn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  async function addContact(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setNotice('Saving contact and consent record…');
    try {
      const response = await fetch('/api/whatsapp/inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_contact',
          connectionId,
          waId: phone.replace(/\D/g, ''),
          name,
          consentSource,
          confirmOptIn,
        }),
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok)
        throw new Error(result.message ?? 'Could not save this contact.');
      setNotice('Contact saved with its opt-in record.');
      setName('');
      setPhone('');
      setConsentSource('');
      setConfirmOptIn(false);
      setShowAdd(false);
      await state.reload();
    } catch (error) {
      setNotice(friendlyError(error, 'Could not save this contact.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h3 className="text-lg font-bold text-stone-900">WhatsApp contacts</h3>
          <p className="mt-1 text-sm text-stone-500">
            Add recipients only when you have their WhatsApp opt-in. New inbound
            messages also create contacts automatically.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            className={`${field} sm:max-w-xs`}
            value={state.search}
            onChange={(event) =>
              setStateSearch(state.setSearch, event.target.value)
            }
            placeholder="Search contacts"
            aria-label="Search contacts"
          />
          {canManage && (
            <button
              type="button"
              className={primaryButton}
              onClick={() => {
                setShowAdd((current) => !current);
                setNotice('');
              }}
            >
              {showAdd ? 'Cancel' : 'Add contact'}
            </button>
          )}
        </div>
      </div>
      {showAdd && canManage && (
        <form
          onSubmit={addContact}
          className="grid gap-3 rounded-2xl border border-[#BD5C3F]/20 bg-[#fffaf7] p-4 md:grid-cols-2"
        >
          <label className="block space-y-1.5 text-xs font-semibold text-stone-600">
            Contact name <span className="font-normal">(optional)</span>
            <input
              className={field}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              placeholder="Customer name"
            />
          </label>
          <label className="block space-y-1.5 text-xs font-semibold text-stone-600">
            WhatsApp number
            <input
              className={field}
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+919876543210"
              pattern="\+?[1-9]\d{7,14}"
              required
            />
          </label>
          <label className="block space-y-1.5 text-xs font-semibold text-stone-600 md:col-span-2">
            Where did they opt in?
            <input
              className={field}
              value={consentSource}
              onChange={(event) => setConsentSource(event.target.value)}
              minLength={3}
              maxLength={200}
              placeholder="Website enquiry form, signed form, or WhatsApp START"
              required
            />
          </label>
          <label className="flex items-start gap-2 text-sm text-stone-700 md:col-span-2">
            <input
              type="checkbox"
              checked={confirmOptIn}
              onChange={(event) => setConfirmOptIn(event.target.checked)}
              required
            />
            <span>
              I confirm this person expressly agreed to receive WhatsApp
              messages from this business.
            </span>
          </label>
          <button className={primaryButton} disabled={saving || !confirmOptIn}>
            {saving ? 'Saving…' : 'Save contact'}
          </button>
        </form>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900"
        >
          {notice}
        </p>
      )}
      {state.error && (
        <p
          role="status"
          className="rounded-xl bg-red-50 p-3 text-sm text-red-800"
        >
          {state.error}
        </p>
      )}
      <div className="overflow-hidden rounded-2xl border border-stone-200">
        <div className="grid grid-cols-[minmax(150px,1.2fr)_minmax(120px,.8fr)_minmax(160px,1.4fr)_120px] gap-3 bg-stone-50 px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-stone-500">
          <span>Name</span>
          <span>WhatsApp number</span>
          <span>Latest message</span>
          <span>Message consent</span>
        </div>
        {state.rows.map((row) => (
          <div
            key={row.id}
            className="grid grid-cols-[minmax(150px,1.2fr)_minmax(120px,.8fr)_minmax(160px,1.4fr)_120px] items-center gap-3 border-t border-stone-100 px-4 py-3 text-sm"
          >
            <div className="truncate font-semibold text-stone-900">
              {row.name || 'Unknown contact'}
            </div>
            <div className="text-stone-600">+{row.wa_id}</div>
            <div className="truncate text-stone-500">
              {row.last_message || '—'}
            </div>
            <div>
              <span
                className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                  row.opted_out
                    ? 'bg-red-50 text-red-700'
                    : row.template_opted_in_at
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-amber-50 text-amber-800'
                }`}
                title={row.template_opt_in_source || undefined}
              >
                {row.opted_out
                  ? 'Opted out'
                  : row.template_opted_in_at
                    ? 'Opted in'
                    : 'No opt-in'}
              </span>
            </div>
          </div>
        ))}
        {!state.busy && state.rows.length === 0 && (
          <p className="p-8 text-center text-sm text-stone-500">
            No contacts yet. Add a recipient with recorded opt-in or wait for
            someone to message this business number.
          </p>
        )}
      </div>
    </div>
  );
}

function AutomationsPanel({
  connectionId,
  canManage,
}: {
  connectionId: string;
  canManage: boolean;
}) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [name, setName] = useState('Welcome reply');
  const [triggerType, setTriggerType] = useState<'any_message' | 'keyword'>(
    'any_message',
  );
  const [keyword, setKeyword] = useState('');
  const [replyText, setReplyText] = useState(
    'Hi {{name}}, thanks for messaging us. Our team will reply shortly.',
  );

  const load = useCallback(async () => {
    if (!connectionId) return;
    const params = new URLSearchParams({
      section: 'automations',
      connectionId,
    });
    const response = await fetch(`/api/whatsapp/inbox?${params}`, {
      cache: 'no-store',
    });
    const result = (await response.json()) as {
      rows?: Rule[];
      message?: string;
    };
    if (!response.ok)
      throw new Error(result.message ?? 'Could not load automations.');
    setRules(result.rows ?? []);
  }, [connectionId]);
  useEffect(() => {
    void load().catch((error: unknown) =>
      setNotice(friendlyError(error, 'Could not load automations.')),
    );
  }, [load]);

  async function saveRule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice('Saving rule…');
    try {
      const response = await fetch('/api/whatsapp/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId,
          name,
          triggerType,
          keyword,
          replyText,
          status: 'paused',
        }),
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok)
        throw new Error(result.message ?? 'Could not save automation.');
      setNotice(
        'Automation saved paused. Review it, then switch it on when ready.',
      );
      setName('');
      setReplyText('');
      setKeyword('');
      await load();
    } catch (error) {
      setNotice(friendlyError(error, 'Could not save automation.'));
    } finally {
      setBusy(false);
    }
  }

  async function toggleRule(rule: Rule) {
    setBusy(true);
    try {
      const response = await fetch('/api/whatsapp/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: rule.id,
          version: rule.version,
          connectionId,
          name: rule.name,
          triggerType: rule.trigger_type,
          keyword: rule.keyword,
          replyText: rule.reply_text,
          status: rule.status === 'active' ? 'paused' : 'active',
        }),
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok)
        throw new Error(result.message ?? 'Could not update automation.');
      setNotice(
        rule.status === 'active' ? 'Automation paused.' : 'Automation enabled.',
      );
      await load();
    } catch (error) {
      setNotice(friendlyError(error, 'Could not update automation.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,.8fr)]">
      <section className="rounded-2xl border border-stone-200 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-stone-900">
              Reply automations
            </h3>
            <p className="mt-1 text-sm leading-6 text-stone-500">
              Send one automatic text reply when a customer starts a
              conversation or sends a matching keyword.
            </p>
          </div>
          <span className="rounded-full bg-[#f9eee9] px-3 py-1 text-xs font-semibold text-[#88352B]">
            {rules.length} rules
          </span>
        </div>
        <div className="mt-4 space-y-3">
          {rules.map((rule) => (
            <article
              key={rule.id}
              className="rounded-xl border border-stone-200 bg-stone-50/70 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h4 className="font-semibold text-stone-900">{rule.name}</h4>
                  <p className="mt-1 text-xs text-stone-500">
                    {rule.trigger_type === 'any_message'
                      ? 'Every inbound text'
                      : `Keyword contains “${rule.keyword}”`}
                  </p>
                </div>
                {canManage && (
                  <button
                    type="button"
                    className={
                      rule.status === 'active' ? primaryButton : softButton
                    }
                    disabled={busy}
                    onClick={() => void toggleRule(rule)}
                  >
                    {rule.status === 'active' ? 'Pause' : 'Turn on'}
                  </button>
                )}
              </div>
              <p className="mt-3 rounded-lg bg-white p-3 text-sm leading-6 text-stone-700">
                {rule.reply_text}
              </p>
            </article>
          ))}
          {!rules.length && (
            <div className="rounded-xl border border-dashed border-stone-300 p-8 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#f9eee9] text-xl">
                ↗
              </div>
              <p className="mt-3 font-semibold text-stone-800">
                No WhatsApp automations yet
              </p>
              <p className="mt-1 text-sm text-stone-500">
                Create a paused reply on the right, then activate it after
                reviewing the wording.
              </p>
            </div>
          )}
        </div>
        {notice && (
          <p
            role="status"
            className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"
          >
            {notice}
          </p>
        )}
      </section>
      {canManage ? (
        <form
          onSubmit={saveRule}
          className="space-y-4 rounded-2xl border border-stone-200 bg-[#fffdfa] p-5"
        >
          <div>
            <h3 className="text-lg font-bold text-stone-900">
              Create a reply rule
            </h3>
            <p className="mt-1 text-sm text-stone-500">
              New rules start paused.
            </p>
          </div>
          <label className="block space-y-1.5 text-xs font-semibold text-stone-600">
            Rule name
            <input
              className={field}
              maxLength={120}
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Welcome reply"
            />
          </label>
          <label className="block space-y-1.5 text-xs font-semibold text-stone-600">
            When
            <select
              className={field}
              value={triggerType}
              onChange={(e) =>
                setTriggerType(e.target.value as typeof triggerType)
              }
            >
              <option value="any_message">Any inbound text message</option>
              <option value="keyword">Message contains a keyword</option>
            </select>
          </label>
          {triggerType === 'keyword' && (
            <label className="block space-y-1.5 text-xs font-semibold text-stone-600">
              Keyword
              <input
                className={field}
                maxLength={80}
                required
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="price"
              />
            </label>
          )}
          <label className="block space-y-1.5 text-xs font-semibold text-stone-600">
            Automatic reply
            <textarea
              className={field}
              rows={5}
              maxLength={1000}
              required
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Write the reply customers will receive"
            />
          </label>
          <button className={primaryButton} disabled={busy}>
            {busy ? 'Saving…' : 'Save paused rule'}
          </button>
          <div className="rounded-xl bg-blue-50 p-3 text-xs leading-5 text-blue-900">
            Rules run only after a customer sends a message and the service
            window is open. STOP, STOPALL, UNSUBSCRIBE, CANCEL, END and QUIT
            automatically opt the contact out and block replies. Avoid sending
            promotional content through this service reply.
          </div>
        </form>
      ) : (
        <div className="rounded-2xl border border-stone-200 bg-stone-50 p-5 text-sm leading-6 text-stone-600">
          Ask a workspace administrator with WhatsApp management access to
          create or activate reply rules.
        </div>
      )}
    </div>
  );
}

function TemplatesPanel({
  connectionId,
  canManage,
  templates,
  loadTemplates,
  notice,
  setNotice,
}: {
  connectionId: string;
  canManage: boolean;
  templates: Template[];
  loadTemplates: () => Promise<void>;
  notice: string;
  setNotice: (value: string) => void;
}) {
  const [recipient, setRecipient] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [language, setLanguage] = useState('en_US');
  const [parameters, setParameters] = useState('');
  const [optedIn, setOptedIn] = useState(false);
  const [newName, setNewName] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newCategory, setNewCategory] = useState('UTILITY');
  const [busy, setBusy] = useState(false);
  const approved = templates.filter((item) => item.status === 'APPROVED');

  function useStarter(item: (typeof starterTemplates)[number]) {
    setNewName(item.name);
    setNewBody(item.body);
    setNewCategory(item.category);
    setNotice(
      `Loaded “${item.title}”. Review it, then submit it to Meta for approval.`,
    );
    document
      .getElementById('whatsapp-template-composer')
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function submitTemplate(event: React.FormEvent<HTMLFormElement>) {
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
      const data = (await response.json()) as { message?: string };
      if (!response.ok)
        throw new Error(data.message ?? 'Template could not be submitted.');
      setNotice(
        'Template submitted to Meta. It will be available to send after approval.',
      );
      setNewName('');
      setNewBody('');
      await loadTemplates();
    } catch (error) {
      setNotice(friendlyError(error, 'Template could not be submitted.'));
    } finally {
      setBusy(false);
    }
  }
  async function sendTemplate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice('Sending approved template…');
    try {
      const response = await fetch('/api/whatsapp/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageType: 'template',
          connectionId,
          to: recipient,
          templateName,
          language,
          parameters: parameters
            .split('\n')
            .map((v) => v.trim())
            .filter(Boolean),
          recipientHasOptedIn: optedIn,
        }),
      });
      const data = (await response.json()) as {
        message?: string;
        messageId?: string;
      };
      if (!response.ok)
        throw new Error(data.message ?? 'Message could not be sent.');
      setNotice(
        `Meta accepted the message (${data.messageId ?? 'message recorded'}).`,
      );
    } catch (error) {
      setNotice(friendlyError(error, 'Message could not be sent.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-7">
      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-stone-900">
              Starter templates
            </h3>
            <p className="mt-1 text-sm text-stone-500">
              Load a ready-to-edit draft. Meta must approve every template
              before business-initiated sending.
            </p>
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            {approved.length} approved
          </span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {starterTemplates.map((item) => (
            <article
              key={item.name}
              className="flex flex-col rounded-2xl border border-stone-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-[#BD5C3F]/50 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="font-semibold text-stone-900">{item.title}</h4>
                  <p className="mt-1 text-xs text-stone-500">{item.note}</p>
                </div>
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-700">
                  Utility
                </span>
              </div>
              <p className="mt-3 flex-1 rounded-xl bg-stone-50 p-3 text-xs leading-5 text-stone-600">
                {item.body}
              </p>
              {canManage && (
                <button
                  type="button"
                  className={`${softButton} mt-3 w-full`}
                  onClick={() => useStarter(item)}
                >
                  Use this template
                </button>
              )}
            </article>
          ))}
        </div>
      </section>
      {canManage ? (
        <div className="grid gap-5 xl:grid-cols-2">
          <form
            onSubmit={sendTemplate}
            className="space-y-4 rounded-2xl border border-stone-200 p-5"
          >
            <div>
              <h3 className="text-lg font-bold text-stone-900">
                Send an approved template
              </h3>
              <p className="mt-1 text-sm text-stone-500">
                The recipient must have opted in. Use only templates approved by
                Meta.
              </p>
            </div>
            <label className="block space-y-1.5 text-xs font-semibold text-stone-600">
              Recipient number
              <input
                className={field}
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="+919876543210"
                pattern="\+[1-9]\d{7,14}"
                required
              />
            </label>
            <label className="block space-y-1.5 text-xs font-semibold text-stone-600">
              Approved template
              <select
                className={field}
                value={`${templateName}|${language}`}
                onChange={(e) => {
                  const [name, locale] = e.target.value.split('|');
                  setTemplateName(name ?? '');
                  setLanguage(locale ?? 'en_US');
                }}
                required
              >
                <option value="|">Select an approved template</option>
                {approved.map((item) => (
                  <option key={item.id} value={`${item.name}|${item.language}`}>
                    {item.name} · {item.language}
                  </option>
                ))}
              </select>
            </label>
            {templateName && (
              <p className="rounded-xl bg-stone-50 p-3 text-xs text-stone-600">
                {templates
                  .find(
                    (item) =>
                      item.name === templateName && item.language === language,
                  )
                  ?.components?.find((item) => item.type === 'BODY')?.text ??
                  'Template body available in Meta WhatsApp Manager.'}
              </p>
            )}
            <label className="block space-y-1.5 text-xs font-semibold text-stone-600">
              Template values, one per line
              <textarea
                className={field}
                rows={3}
                value={parameters}
                onChange={(e) => setParameters(e.target.value)}
                placeholder="Only when the template uses {{1}}, {{2}}, …"
              />
            </label>
            <label className="flex items-start gap-2 text-sm text-stone-600">
              <input
                type="checkbox"
                checked={optedIn}
                onChange={(e) => setOptedIn(e.target.checked)}
                required
              />
              I confirm this recipient opted in to receive messages from this
              business.
            </label>
            <button
              className={primaryButton}
              disabled={busy || !templateName || !optedIn}
            >
              {busy ? 'Working…' : 'Send template'}
            </button>
          </form>
          <form
            id="whatsapp-template-composer"
            onSubmit={submitTemplate}
            className="space-y-4 rounded-2xl border border-stone-200 bg-[#fffdfa] p-5"
          >
            <div>
              <h3 className="text-lg font-bold text-stone-900">
                Create a template draft
              </h3>
              <p className="mt-1 text-sm text-stone-500">
                Templates submitted here go to Meta review; they are not
                immediately sendable.
              </p>
            </div>
            <label className="block space-y-1.5 text-xs font-semibold text-stone-600">
              Template name
              <input
                className={field}
                value={newName}
                onChange={(e) =>
                  setNewName(
                    e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
                  )
                }
                placeholder="appointment_reminder"
                pattern="[a-z0-9_]{3,512}"
                required
              />
            </label>
            <label className="block space-y-1.5 text-xs font-semibold text-stone-600">
              Category
              <select
                className={field}
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
              >
                <option value="UTILITY">Utility</option>
                <option value="MARKETING">Marketing</option>
              </select>
            </label>
            <label className="block space-y-1.5 text-xs font-semibold text-stone-600">
              Message text
              <textarea
                className={field}
                rows={5}
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                placeholder="Hello {{1}}, your appointment is on {{2}}."
                maxLength={1024}
                required
              />
            </label>
            <button className={primaryButton} disabled={busy}>
              {busy ? 'Submitting…' : 'Submit draft to Meta'}
            </button>
          </form>
        </div>
      ) : (
        <p className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm text-stone-600">
          Your account has view access. Ask a workspace administrator to send
          messages or manage template submissions.
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900"
        >
          {notice}
        </p>
      )}
      <p className="rounded-xl bg-stone-50 p-4 text-xs leading-5 text-stone-600">
        <strong>Messaging rules:</strong> free-form replies are limited to the
        customer service window. Use approved templates outside that window,
        honor STOP requests, and send templates only to opted-in recipients.
      </p>
    </div>
  );
}
