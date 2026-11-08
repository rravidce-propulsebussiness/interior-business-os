'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import './whatsapp-inbox.css';
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
type Tab =
  | 'overview'
  | 'inbox'
  | 'contacts'
  | 'broadcasts'
  | 'templates'
  | 'automations'
  | 'analytics'
  | 'settings';

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
  settingsPanel,
}: {
  connections: Connection[];
  canManage: boolean;
  settingsPanel?: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>('inbox');
  const [connectionId, setConnectionId] = useState(connections[0]?.id ?? '');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [notice, setNotice] = useState('');
  const [contactModal, setContactModal] = useState<{
    name: string;
    phone: string;
    consentSource: string;
    confirmOptIn: boolean;
  } | null>(null);
  const [contactSaving, setContactSaving] = useState(false);
  const [contactRefresh, setContactRefresh] = useState(0);

  const loadTemplates = useCallback(async () => {
    if (!connectionId) return;
    const response = await fetch(
      `/api/whatsapp/templates?connectionId=${encodeURIComponent(connectionId)}`,
      { cache: 'no-store' },
    );
    const result = (await readApiResponse(response)) as {
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

  const tabs: Array<{ id: Tab; label: string; icon: string }> = [
    { id: 'inbox', label: 'Inbox', icon: 'message' },
    { id: 'contacts', label: 'Contacts', icon: 'people' },
    { id: 'broadcasts', label: 'Broadcasts', icon: 'broadcast' },
    { id: 'templates', label: 'Templates', icon: 'template' },
    { id: 'automations', label: 'Automations', icon: 'automation' },
    { id: 'analytics', label: 'Analytics', icon: 'analytics' },
    { id: 'settings', label: 'Settings', icon: 'settings' },
  ];

  if (!connections.length) return null;

  async function saveContact(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!contactModal || !connectionId) return;
    setContactSaving(true);
    setNotice('Saving contact and opt-in record…');
    try {
      const response = await fetch('/api/whatsapp/inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_contact',
          connectionId,
          waId: contactModal.phone.replace(/\D/g, ''),
          name: contactModal.name,
          consentSource: contactModal.consentSource,
          confirmOptIn: contactModal.confirmOptIn,
        }),
      });
      const result = (await readApiResponse(response)) as { message?: string };
      if (!response.ok)
        throw new Error(result.message ?? 'Could not save this contact.');
      setContactRefresh((value) => value + 1);
      setContactModal(null);
      setNotice('Contact saved with its opt-in record.');
      setTab('contacts');
    } catch (error) {
      setNotice(friendlyError(error, 'Could not save this contact.'));
    } finally {
      setContactSaving(false);
    }
  }

  return (
    <section className="wa-shell">
      <aside className="wa-sidebar" aria-label="ProPulse messaging navigation">
        <div className="wa-brand">
          <span className="wa-brand-mark">P</span>
          <span>
            <strong>ProPulse</strong>
            <small>Business OS</small>
          </span>
        </div>
        <div className="wa-nav-label">WORKSPACE</div>
        <nav className="wa-nav">
          <button
            className={`wa-nav-item ${tab === 'overview' ? 'wa-nav-item-active' : ''}`}
            type="button"
            aria-current={tab === 'overview' ? 'page' : undefined}
            onClick={() => setTab('overview')}
          >
            <NavIcon kind="overview" /> Overview
          </button>
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setTab(item.id);
                setNotice('');
              }}
              aria-current={tab === item.id ? 'page' : undefined}
              className={`wa-nav-item ${tab === item.id ? 'wa-nav-item-active' : ''}`}
            >
              <NavIcon kind={item.icon} /> {item.label}
              {item.id === 'inbox' && (
                <span className="wa-nav-count">{/* filled from inbox */}•</span>
              )}
            </button>
          ))}
        </nav>
        <div className="wa-sidebar-promo">
          <span className="wa-promo-icon">
            <NavIcon kind="automation" />
          </span>
          <strong>Grow with automations</strong>
          <p>Save time and respond automatically.</p>
          <button type="button" onClick={() => setTab('automations')}>
            Go to Automations <span>→</span>
          </button>
        </div>
        <div className="wa-account-health">
          <span className="wa-online-dot" />
          <span>
            <strong>WhatsApp account</strong>
            <small>Connected</small>
          </span>
          <span className="wa-account-ellipsis">•••</span>
        </div>
      </aside>

      <div className="wa-main">
        <header className="wa-topbar">
          <div className="wa-topbar-title">
            <span className="wa-whatsapp-mark">◉</span>
            <div>
              <h1>WhatsApp Inbox</h1>
              <p>Team conversations and customer care</p>
            </div>
          </div>
          <div className="wa-topbar-actions">
            <label className="wa-connection-select">
              <span aria-hidden="true">▦</span>
              <select
                value={connectionId}
                onChange={(event) => setConnectionId(event.target.value)}
                aria-label="Connected business number"
              >
                {connections.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.phone}
                  </option>
                ))}
              </select>
            </label>
            <span className="wa-connected-badge">
              <i /> Connected
            </span>
            <div className="wa-topbar-avatars" aria-label="Workspace team">
              <span title="ProPulse workspace">PP</span>
            </div>
            <button
              className="wa-icon-button"
              type="button"
              aria-label="Search"
              onClick={() => setTab('contacts')}
            >
              <NavIcon kind="search" />
            </button>
            <button
              className="wa-icon-button wa-notification"
              type="button"
              aria-label="Notifications"
            >
              <NavIcon kind="bell" />
            </button>
            <button
              className="wa-new-message"
              type="button"
              onClick={() => setTab('templates')}
            >
              <NavIcon kind="compose" /> New message
            </button>
          </div>
        </header>

        <div className="wa-content">
          <div className="wa-section-heading">
            <div>
              <span className="wa-eyebrow">PROPULSE MESSAGING</span>
              <h2>
                {tab === 'overview'
                  ? 'Overview'
                  : tab === 'inbox'
                    ? 'Inbox'
                    : tabs.find((item) => item.id === tab)?.label}
              </h2>
            </div>
            <button
              type="button"
              className="wa-add-contact"
              onClick={() =>
                setContactModal({
                  name: '',
                  phone: '',
                  consentSource: '',
                  confirmOptIn: false,
                })
              }
            >
              <NavIcon kind="people" /> Add contact
            </button>
          </div>
          {notice && (
            <p className="wa-global-notice" role="status">
              {notice}
            </p>
          )}
          {tab === 'overview' && (
            <OverviewPanel
              connectionId={connectionId}
              refreshKey={contactRefresh}
              onNavigate={setTab}
            />
          )}
          {tab === 'inbox' && (
            <InboxPanel
              connectionId={connectionId}
              canManage={canManage}
              refreshKey={contactRefresh}
              onEditContact={(contact) =>
                setContactModal({
                  name: contact.name,
                  phone: `+${contact.wa_id}`,
                  consentSource: '',
                  confirmOptIn: false,
                })
              }
              onNavigate={setTab}
            />
          )}
          {tab === 'contacts' && (
            <ContactsPanel
              connectionId={connectionId}
              refreshKey={contactRefresh}
              onAddContact={() =>
                setContactModal({
                  name: '',
                  phone: '',
                  consentSource: '',
                  confirmOptIn: false,
                })
              }
            />
          )}
          {tab === 'automations' && (
            <AutomationsPanel
              connectionId={connectionId}
              canManage={canManage}
            />
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
          {tab === 'broadcasts' && (
            <BroadcastsPanel templates={templates} onNavigate={setTab} />
          )}
          {tab === 'analytics' && (
            <AnalyticsPanel
              connectionId={connectionId}
              refreshKey={contactRefresh}
            />
          )}
          {tab === 'settings' && (
            <SettingsPanel
              connections={connections}
              settingsPanel={settingsPanel}
            />
          )}
        </div>
      </div>

      {contactModal && (
        <div
          className="wa-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setContactModal(null);
          }}
        >
          <form
            className="wa-contact-modal"
            onSubmit={saveContact}
            aria-labelledby="wa-contact-modal-title"
          >
            <div className="wa-modal-heading">
              <div>
                <span className="wa-eyebrow">CONTACT BOOK</span>
                <h2 id="wa-contact-modal-title">
                  {contactModal.name
                    ? 'Edit contact details'
                    : 'Add a WhatsApp contact'}
                </h2>
              </div>
              <button
                type="button"
                className="wa-modal-close"
                aria-label="Close"
                onClick={() => setContactModal(null)}
              >
                ×
              </button>
            </div>
            <p className="wa-modal-copy">
              Record the source of the customer’s WhatsApp opt-in before saving
              this contact for business-initiated messages.
            </p>
            <label>
              Name
              <input
                required
                maxLength={120}
                value={contactModal.name}
                onChange={(event) =>
                  setContactModal({ ...contactModal, name: event.target.value })
                }
                placeholder="Customer name"
              />
            </label>
            <label>
              WhatsApp number
              <input
                required
                value={contactModal.phone}
                onChange={(event) =>
                  setContactModal({
                    ...contactModal,
                    phone: event.target.value,
                  })
                }
                placeholder="+919876543210"
                pattern="\+[1-9]\d{7,14}"
              />
            </label>
            <label>
              Where did they opt in?
              <input
                required
                minLength={3}
                maxLength={200}
                value={contactModal.consentSource}
                onChange={(event) =>
                  setContactModal({
                    ...contactModal,
                    consentSource: event.target.value,
                  })
                }
                placeholder="Website enquiry form, signed form, or WhatsApp START"
              />
            </label>
            <label className="wa-consent-note">
              <input
                type="checkbox"
                required
                checked={contactModal.confirmOptIn}
                onChange={(event) =>
                  setContactModal({
                    ...contactModal,
                    confirmOptIn: event.target.checked,
                  })
                }
              />
              I confirm this person expressly agreed to receive WhatsApp
              messages from this business.
            </label>
            <div className="wa-modal-actions">
              <button
                type="button"
                className="wa-modal-cancel"
                onClick={() => setContactModal(null)}
              >
                Cancel
              </button>
              <button
                className="wa-new-message"
                disabled={contactSaving || !contactModal.confirmOptIn}
              >
                {contactSaving ? 'Saving…' : 'Save contact'}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

function NavIcon({ kind }: { kind: string }) {
  const paths: Record<string, ReactNode> = {
    overview: (
      <>
        <path d="m3 10 9-7 9 7" />
        <path d="M5 9v11h14V9M9 20v-6h6v6" />
      </>
    ),
    message: (
      <>
        <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 8.7 4a8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z" />
      </>
    ),
    people: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="10" cy="7" r="4" />
        <path d="M20 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
      </>
    ),
    broadcast: (
      <>
        <path d="m3 11 18-5-5 18-4-8-9-5z" />
        <path d="m12 16 4-5" />
      </>
    ),
    template: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M7 8h10M7 12h10M7 16h5" />
      </>
    ),
    automation: (
      <>
        <path d="m13 2-3 8h7l-6 12 2-9H6l7-11z" />
      </>
    ),
    analytics: (
      <>
        <path d="M3 3v18h18" />
        <path d="m19 9-5 5-4-4-5 5" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path
          d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7a8 8 0 0 1-1.6.9l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.6-.9l-1.7.7-1.4-2.4 1.4-1.1a8 8 0 0 1 0-1.9l-1.4-1.1 1.4-2.4 1.7.7a8 8 0 0 1 1.6-.9l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.6.9l1.7-.7 1.4 2.4-1.4 1.1a8 8 0 0 1-.1 1.8z"
          transform="translate(-2 -2)"
        />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    bell: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
      </>
    ),
    compose: (
      <>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
      </>
    ),
  };
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[kind] ?? paths.message}
    </svg>
  );
}

function useWorkspaceRows(
  section: 'inbox' | 'contacts',
  connectionId: string,
  refreshKey = 0,
) {
  const [rows, setRows] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [unread, setUnread] = useState(0);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async (quiet = false) => {
    if (!connectionId) return;
    if (!quiet) setBusy(true);
    try {
      const params = new URLSearchParams({ section, connectionId, search });
      const response = await fetch(`/api/whatsapp/inbox?${params}`, {
        cache: 'no-store',
      });
      const data = (await readApiResponse(response)) as {
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
      if (!quiet) setBusy(false);
    }
  }, [connectionId, search, section]);
  useEffect(() => {
    void load();
  }, [load, refreshKey]);
  useEffect(() => {
    if (section !== 'inbox') return;
    let timer: ReturnType<typeof setTimeout>;
    let active = true;
    const refresh = async () => {
      if (document.visibilityState === 'visible') await load(true);
      if (active) timer = setTimeout(() => void refresh(), 4000);
    };
    timer = setTimeout(() => void refresh(), 4000);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [load, section]);
  return { rows, total, unread, search, setSearch, busy, error, reload: load };
}

function InboxPanel({
  connectionId,
  canManage,
  refreshKey,
  onEditContact,
  onNavigate,
}: {
  connectionId: string;
  canManage: boolean;
  refreshKey: number;
  onEditContact: (contact: Contact) => void;
  onNavigate: (tab: Tab) => void;
}) {
  const state = useWorkspaceRows('inbox', connectionId, refreshKey);
  const [selected, setSelected] = useState('');
  const [thread, setThread] = useState<Message[]>([]);
  const [contact, setContact] = useState<Contact | null>(null);
  const [body, setBody] = useState('');
  const [conversationFilter, setConversationFilter] = useState<
    'all' | 'unread'
  >('all');
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
      const data = (await readApiResponse(response)) as {
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
  }, [loadThread, selected, state.rows]);
  useEffect(() => {
    if (!selected) return;
    let timer: ReturnType<typeof setTimeout>;
    let active = true;
    const refresh = async () => {
      if (document.visibilityState === 'visible') {
        try {
          await loadThread(selected);
        } catch {
          // Keep the existing conversation visible through temporary network errors.
        }
      }
      if (active) timer = setTimeout(() => void refresh(), 4000);
    };
    timer = setTimeout(() => void refresh(), 4000);
    return () => {
      active = false;
      clearTimeout(timer);
    };
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
      const result = (await readApiResponse(response)) as { message?: string };
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

  const visibleRows =
    conversationFilter === 'unread'
      ? state.rows.filter((row) => row.unread)
      : state.rows;

  return (
    <div className="wa-inbox-grid">
      <aside className="wa-conversation-panel">
        <div className="wa-conversation-toolbar">
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
          <div
            className="wa-list-filters"
            role="tablist"
            aria-label="Conversation filters"
          >
            <button
              type="button"
              className={conversationFilter === 'all' ? 'wa-filter-active' : ''}
              onClick={() => setConversationFilter('all')}
            >
              All <span>({state.total})</span>
            </button>
            <button
              type="button"
              className={
                conversationFilter === 'unread' ? 'wa-filter-active' : ''
              }
              onClick={() => setConversationFilter('unread')}
            >
              Unread <span>({state.unread})</span>
            </button>
            <button
              type="button"
              disabled
              title="Conversation assignments are not configured yet"
            >
              Assigned to me <span>(0)</span>
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
        <div className="wa-conversation-list">
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
          {visibleRows.map((row) => (
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
                <span className="wa-contact-label">WhatsApp</span>
              </div>
            </button>
          ))}
        </div>
      </aside>
      <div className="wa-thread-column">
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
            <header className="wa-thread-header">
              <div className="flex min-w-0 items-center gap-3">
                <span className="wa-contact-avatar">
                  {(contact.name || contact.wa_id).slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <h3 className="truncate font-bold text-stone-900">
                    {contact.name || `+${contact.wa_id}`}
                  </h3>
                  <p className="mt-0.5 text-xs text-stone-500">
                    Last activity {readableDate(contact.last_message_at)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="wa-icon-button"
                  aria-label="Edit contact details"
                  onClick={() => onEditContact(contact)}
                >
                  <NavIcon kind="people" />
                </button>
                <button
                  type="button"
                  className="wa-icon-button"
                  aria-label="More contact actions"
                >
                  •••
                </button>
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
            <div className="wa-message-history">
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
                    className={`wa-message-bubble ${item.direction === 'outbound' ? 'wa-message-out' : 'wa-message-in'}`}
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
            <form onSubmit={sendReply} className="wa-composer">
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
                  <div className="wa-composer-row">
                    <button
                      type="button"
                      className="wa-composer-attachment"
                      aria-label="Attachments unavailable"
                      title="Attachment messaging is not supported yet"
                      disabled
                    >
                      ＋
                    </button>
                    <button
                      type="button"
                      className="wa-composer-template"
                      onClick={() => onNavigate('templates')}
                    >
                      ▤ Template⌄
                    </button>
                    <label className="wa-composer-input">
                      <span className="sr-only">Write a WhatsApp reply</span>
                      <textarea
                        id="whatsapp-reply"
                        rows={1}
                        maxLength={4096}
                        value={body}
                        onChange={(event) => setBody(event.target.value)}
                        placeholder="Type a message…"
                      />
                    </label>
                    <button
                      type="button"
                      className="wa-composer-emoji"
                      aria-label="Insert smile emoji"
                      onClick={() => setBody((value) => `${value}🙂`)}
                    >
                      ☺
                    </button>
                    <button
                      className="wa-send-button"
                      disabled={busy || !body.trim()}
                      aria-label="Send message"
                    >
                      {busy ? '…' : '➤'}
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-stone-500">
                      Free-form replies work within 24 hours of the customer’s
                      latest message.
                    </p>
                    <span className="text-xs text-stone-400">
                      Press send to reply
                    </span>
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
      <ContactProfile
        contact={contact}
        onEdit={onEditContact}
        onOptOut={() => void changeOptOut()}
        onNavigate={onNavigate}
      />
    </div>
  );
}

function setStateSearch(set: (value: string) => void, value: string) {
  set(value);
}

function ContactProfile({
  contact,
  onEdit,
  onOptOut,
  onNavigate,
}: {
  contact: Contact | null;
  onEdit: (contact: Contact) => void;
  onOptOut: () => void;
  onNavigate: (tab: Tab) => void;
}) {
  if (!contact) {
    return (
      <aside className="wa-contact-profile">
        <div className="wa-profile-empty">
          <span className="wa-profile-empty-mark">
            <NavIcon kind="people" />
          </span>
          <strong>Contact details</strong>
          <p>
            Select a conversation to view customer details, reply eligibility,
            and quick actions.
          </p>
        </div>
        <div className="wa-quick-actions">
          <h3>Quick actions</h3>
          <div className="wa-quick-action-grid">
            <button type="button" onClick={() => onNavigate('automations')}>
              <NavIcon kind="automation" />
              Automations
            </button>
            <button type="button" onClick={() => onNavigate('templates')}>
              <NavIcon kind="template" />
              Templates
            </button>
            <button type="button" onClick={() => onNavigate('broadcasts')}>
              <NavIcon kind="broadcast" />
              Campaigns
            </button>
          </div>
        </div>
      </aside>
    );
  }
  return (
    <aside className="wa-contact-profile">
      <div className="wa-profile-person">
        <span className="wa-profile-avatar">
          {(contact.name || contact.wa_id).slice(0, 1).toUpperCase()}
        </span>
        <h3>{contact.name || 'WhatsApp contact'}</h3>
        <p>+{contact.wa_id}</p>
        <span className="wa-profile-number-copy">WhatsApp</span>
      </div>
      <div className="wa-profile-section">
        <div className="wa-profile-section-heading">
          <h4>Tags</h4>
          <span className="wa-profile-muted">Channel</span>
        </div>
        <div className="wa-tag-list">
          <span className="wa-tag">WhatsApp</span>
          {contact.opted_out && (
            <span className="wa-tag wa-tag-danger">Opted out</span>
          )}
        </div>
      </div>
      <div className="wa-profile-meta">
        <div>
          <span>Assigned to</span>
          <strong>Unassigned</strong>
        </div>
        <div>
          <span>Source</span>
          <strong>WhatsApp</strong>
        </div>
        <div>
          <span>Consent</span>
          <strong
            className={
              contact.opted_out
                ? 'wa-consent-bad'
                : contact.template_opted_in_at
                  ? 'wa-consent-good'
                  : 'wa-consent-unknown'
            }
          >
            {contact.opted_out
              ? 'Opted out'
              : contact.template_opted_in_at
                ? 'Opt-in recorded'
                : 'Not recorded'}
          </strong>
        </div>
        <div>
          <span>Last contact</span>
          <strong>{readableDate(contact.last_message_at)}</strong>
        </div>
      </div>
      <div className="wa-profile-buttons">
        <button
          className="wa-profile-primary"
          type="button"
          onClick={() => onEdit(contact)}
        >
          <NavIcon kind="people" /> Edit contact
        </button>
        {!contact.opted_out && (
          <button
            className="wa-profile-secondary"
            type="button"
            onClick={onOptOut}
          >
            ⊘ Mark opted out
          </button>
        )}
      </div>
      <div className="wa-quick-actions">
        <h3>Quick actions</h3>
        <div className="wa-quick-action-grid">
          <button type="button" onClick={() => onNavigate('automations')}>
            <NavIcon kind="automation" />
            Automations
          </button>
          <button type="button" onClick={() => onNavigate('templates')}>
            <NavIcon kind="template" />
            Templates
          </button>
          <button type="button" onClick={() => onNavigate('broadcasts')}>
            <NavIcon kind="broadcast" />
            Campaigns
          </button>
        </div>
        <button
          className="wa-view-contacts"
          type="button"
          onClick={() => onNavigate('contacts')}
        >
          <NavIcon kind="people" /> View in Contacts <span>→</span>
        </button>
      </div>
    </aside>
  );
}

function OverviewPanel({
  connectionId,
  refreshKey,
  onNavigate,
}: {
  connectionId: string;
  refreshKey: number;
  onNavigate: (tab: Tab) => void;
}) {
  const state = useWorkspaceRows('inbox', connectionId, refreshKey);
  return (
    <section className="wa-feature-page">
      <div className="wa-feature-hero">
        <span className="wa-feature-icon">
          <NavIcon kind="overview" />
        </span>
        <div>
          <span className="wa-eyebrow">WORKSPACE OVERVIEW</span>
          <h3>Keep every WhatsApp conversation moving</h3>
          <p>
            Review new conversations, manage your contacts, and prepare approved
            template messages.
          </p>
        </div>
      </div>
      {state.error && (
        <p role="status" className="wa-global-notice">
          {state.error}
        </p>
      )}
      <div className="wa-feature-cards">
        <article>
          <span>Contacts</span>
          <strong>{state.total}</strong>
          <small>For this business number</small>
        </article>
        <article>
          <span>Unread</span>
          <strong>{state.unread}</strong>
          <small>Waiting for your team</small>
        </article>
        <article>
          <span>Account</span>
          <strong>{state.busy ? 'Loading' : 'Connected'}</strong>
          <small>WhatsApp Cloud API</small>
        </article>
      </div>
      <div className="wa-overview-actions">
        <button type="button" onClick={() => onNavigate('inbox')}>
          <NavIcon kind="message" />
          <span>
            <strong>Open inbox</strong>
            <small>Read and reply to conversations</small>
          </span>
          <b>→</b>
        </button>
        <button type="button" onClick={() => onNavigate('contacts')}>
          <NavIcon kind="people" />
          <span>
            <strong>Manage contacts</strong>
            <small>Search or add a WhatsApp contact</small>
          </span>
          <b>→</b>
        </button>
        <button type="button" onClick={() => onNavigate('automations')}>
          <NavIcon kind="automation" />
          <span>
            <strong>Set up automations</strong>
            <small>Create a paused reply rule</small>
          </span>
          <b>→</b>
        </button>
        <button type="button" onClick={() => onNavigate('templates')}>
          <NavIcon kind="template" />
          <span>
            <strong>Review templates</strong>
            <small>Check Meta approval status</small>
          </span>
          <b>→</b>
        </button>
      </div>
    </section>
  );
}

function BroadcastsPanel({
  templates,
  onNavigate,
}: {
  templates: Template[];
  onNavigate: (tab: Tab) => void;
}) {
  const approvedCount = templates.filter(
    (template) => template.status === 'APPROVED',
  ).length;
  return (
    <section className="wa-feature-page">
      <div className="wa-feature-hero">
        <span className="wa-feature-icon">
          <NavIcon kind="broadcast" />
        </span>
        <div>
          <span className="wa-eyebrow">CAMPAIGNS</span>
          <h3>WhatsApp broadcasts</h3>
          <p>
            Send approved template updates to contacts who have explicitly opted
            in.
          </p>
        </div>
      </div>
      <div className="wa-feature-cards">
        <article>
          <span>Approved templates</span>
          <strong>{approvedCount}</strong>
          <small>Available from Meta</small>
        </article>
        <article>
          <span>Audience source</span>
          <strong>Contacts</strong>
          <small>Consent must be confirmed</small>
        </article>
        <article>
          <span>Delivery updates</span>
          <strong>WhatsApp</strong>
          <small>Status events are captured</small>
        </article>
      </div>
      <div className="wa-feature-empty">
        <span className="wa-feature-icon">
          <NavIcon kind="template" />
        </span>
        <h4>
          {approvedCount
            ? 'Create a campaign from an approved template'
            : 'No approved templates yet'}
        </h4>
        <p>
          {approvedCount
            ? 'Choose an approved template and review your opted-in audience before any campaign is sent.'
            : 'Submit a utility or marketing template to Meta. Once approved, it can be selected for eligible contacts.'}
        </p>
        <button
          type="button"
          className="wa-add-contact"
          onClick={() => onNavigate('templates')}
        >
          Open templates <span>→</span>
        </button>
      </div>
    </section>
  );
}

function AnalyticsPanel({
  connectionId,
  refreshKey,
}: {
  connectionId: string;
  refreshKey: number;
}) {
  const state = useWorkspaceRows('inbox', connectionId, refreshKey);
  return (
    <section className="wa-feature-page">
      <div className="wa-feature-hero">
        <span className="wa-feature-icon">
          <NavIcon kind="analytics" />
        </span>
        <div>
          <span className="wa-eyebrow">PERFORMANCE</span>
          <h3>WhatsApp analytics</h3>
          <p>Current conversation totals for the selected business number.</p>
        </div>
      </div>
      {state.error && (
        <p role="status" className="wa-global-notice">
          {state.error}
        </p>
      )}
      <div className="wa-feature-cards">
        <article>
          <span>Total contacts</span>
          <strong>{state.total}</strong>
          <small>Saved to this number</small>
        </article>
        <article>
          <span>Unread conversations</span>
          <strong>{state.unread}</strong>
          <small>Awaiting team review</small>
        </article>
        <article>
          <span>Inbox state</span>
          <strong>{state.busy ? 'Loading' : 'Connected'}</strong>
          <small>Latest read from workspace</small>
        </article>
      </div>
      <div className="wa-analytics-note">
        <span className="wa-online-dot" />
        <p>
          Message delivery and reply-time metrics will appear as WhatsApp events
          are received.
        </p>
        <button
          type="button"
          className="wa-add-contact"
          onClick={() => void state.reload()}
        >
          Refresh data
        </button>
      </div>
    </section>
  );
}

function SettingsPanel({
  connections,
  settingsPanel,
}: {
  connections: Connection[];
  settingsPanel?: ReactNode;
}) {
  return (
    <section className="wa-feature-page wa-settings-page">
      <div className="wa-feature-hero">
        <span className="wa-feature-icon">
          <NavIcon kind="settings" />
        </span>
        <div>
          <span className="wa-eyebrow">ACCOUNT</span>
          <h3>WhatsApp settings</h3>
          <p>Manage connected business numbers and messaging access.</p>
        </div>
      </div>
      <div className="wa-feature-cards">
        {connections.map((connection) => (
          <article key={connection.id}>
            <span>{connection.name}</span>
            <strong>{connection.phone}</strong>
            <small>{connection.status}</small>
          </article>
        ))}
      </div>
      {settingsPanel ? (
        <div className="wa-setup-card">{settingsPanel}</div>
      ) : (
        <p className="wa-analytics-note">
          Connection setup is not available for your current role.
        </p>
      )}
    </section>
  );
}

function ContactsPanel({
  connectionId,
  refreshKey,
  onAddContact,
}: {
  connectionId: string;
  refreshKey: number;
  onAddContact: () => void;
}) {
  const state = useWorkspaceRows('contacts', connectionId, refreshKey);
  return (
    <div>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h3 className="text-lg font-bold text-stone-900">
            WhatsApp contacts
          </h3>
          <p className="mt-1 text-sm text-stone-500">
            Contacts are added when a person messages the connected business
            number.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <input
            className={`${field} sm:max-w-xs`}
            value={state.search}
            onChange={(event) =>
              setStateSearch(state.setSearch, event.target.value)
            }
            placeholder="Search contacts"
            aria-label="Search contacts"
          />
          <button
            className="wa-add-contact"
            type="button"
            onClick={onAddContact}
          >
            <NavIcon kind="people" /> Add contact
          </button>
        </div>
      </div>
      {state.error && (
        <p
          role="status"
          className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800"
        >
          {state.error}
        </p>
      )}
      <div className="mt-5 overflow-hidden rounded-2xl border border-stone-200">
        <div className="grid grid-cols-[minmax(150px,1.2fr)_minmax(120px,.8fr)_minmax(160px,1.4fr)_110px] gap-3 bg-stone-50 px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-stone-500">
          <span>Name</span>
          <span>WhatsApp number</span>
          <span>Latest message</span>
          <span>Consent</span>
        </div>
        {state.rows.map((row) => (
          <div
            key={row.id}
            className="grid grid-cols-[minmax(150px,1.2fr)_minmax(120px,.8fr)_minmax(160px,1.4fr)_110px] items-center gap-3 border-t border-stone-100 px-4 py-3 text-sm"
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
                className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${row.opted_out ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}
              >
                {row.opted_out
                  ? 'Opted out'
                  : row.template_opted_in_at
                    ? 'Opt-in recorded'
                    : 'No opt-in'}
              </span>
            </div>
          </div>
        ))}
        {!state.busy && state.rows.length === 0 && (
          <p className="p-8 text-center text-sm text-stone-500">
            Contacts will appear after the first inbound WhatsApp message.
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
    const result = (await readApiResponse(response)) as {
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
      const result = (await readApiResponse(response)) as { message?: string };
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
      const result = (await readApiResponse(response)) as { message?: string };
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
  const [refreshing, setRefreshing] = useState(false);
  const approved = templates.filter((item) =>
    ['APPROVED', 'ACTIVE'].includes(item.status.toUpperCase()),
  );
  const pending = templates.filter((item) =>
    ['PENDING', 'IN_REVIEW'].includes(item.status.toUpperCase()),
  );
  const rejected = templates.filter((item) =>
    ['REJECTED'].includes(item.status.toUpperCase()),
  );

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
      const data = (await readApiResponse(response)) as { message?: string };
      if (!response.ok)
        throw new Error(data.message ?? 'Template could not be submitted.');
      setNotice(
        'Template submitted to Meta. Its current review status is shown below.',
      );
      setNewName('');
      setNewBody('');
      try {
        await loadTemplates();
      } catch {
        setNotice(
          'Template submitted to Meta, but its status could not be refreshed. Use Refresh status below.',
        );
      }
    } catch (error) {
      setNotice(friendlyError(error, 'Template could not be submitted.'));
    } finally {
      setBusy(false);
    }
  }
  async function refreshStatus() {
    setRefreshing(true);
    try {
      await loadTemplates();
      setNotice('Template status refreshed from Meta.');
    } catch (error) {
      setNotice(
        friendlyError(error, 'Could not refresh template status from Meta.'),
      );
    } finally {
      setRefreshing(false);
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
      const data = (await readApiResponse(response)) as {
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
      <section className="space-y-4 rounded-2xl border border-stone-200 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-stone-900">
              Template approval status
            </h3>
            <p className="mt-1 text-sm text-stone-500">
              Status is read from Meta for the selected WhatsApp number.
            </p>
          </div>
          <button
            type="button"
            className={softButton}
            onClick={() => void refreshStatus()}
            disabled={refreshing || busy}
          >
            {refreshing ? 'Refreshing…' : 'Refresh status'}
          </button>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full bg-amber-50 px-3 py-1.5 text-amber-900">
            Pending · {pending.length}
          </span>
          <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-emerald-800">
            Approved · {approved.length}
          </span>
          <span className="rounded-full bg-rose-50 px-3 py-1.5 text-rose-800">
            Rejected · {rejected.length}
          </span>
          <span className="rounded-full bg-stone-100 px-3 py-1.5 text-stone-600">
            {templates.length} total
          </span>
        </div>
        {templates.length ? (
          <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200">
            {[...templates]
              .sort((left, right) => left.name.localeCompare(right.name))
              .map((item) => {
                const status = item.status.toUpperCase();
                const isPending = ['PENDING', 'IN_REVIEW'].includes(status);
                const isApproved = ['APPROVED', 'ACTIVE'].includes(status);
                const isRejected = status === 'REJECTED';
                const label = isPending
                  ? 'Pending'
                  : isApproved
                    ? 'Approved'
                    : status.replaceAll('_', ' ').toLowerCase();
                const badge = isPending
                  ? 'bg-amber-50 text-amber-900'
                  : isApproved
                    ? 'bg-emerald-50 text-emerald-800'
                    : isRejected
                      ? 'bg-rose-50 text-rose-800'
                      : 'bg-stone-100 text-stone-700';
                return (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="break-all text-sm font-semibold text-stone-900">
                        {item.name}
                      </p>
                      <p className="mt-0.5 text-xs text-stone-500">
                        {item.category ?? 'Template'} · {item.language}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-bold ${badge}`}
                    >
                      {label}
                    </span>
                  </li>
                );
              })}
          </ul>
        ) : (
          <p className="rounded-xl bg-stone-50 p-4 text-sm text-stone-600">
            Meta has not returned any templates for this number yet. After
            submitting, use Refresh status to check again.
          </p>
        )}
      </section>
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
