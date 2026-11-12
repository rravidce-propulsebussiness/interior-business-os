'use client';

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import './whatsapp-inbox.css';
import { WhatsAppCalling } from './calling';
import { readApiResponse } from '@/lib/whatsapp-response';
import {
  whatsappMessagePreview,
  whatsappPlaceholderLabel,
} from '@/lib/whatsapp-message-label';
import { createBrowserDatabase } from '@business-os/database/browser';
import { parseContactSheet } from '@/lib/whatsapp-contact-sheet';
import { metaBillingUrl, whatsappErrorHelp } from '@/lib/whatsapp-error-help';

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
  /** Optimistic outbound message shown before Meta accepts it. */
  local?: boolean;
  waId?: string;
};
type Rule = {
  id: string;
  version: number;
  connection_id: string;
  name: string;
  trigger_type: TriggerType;
  keyword: string;
  reply_text: string;
  status: 'active' | 'paused';
  schedule?: Partial<Schedule>;
  menu?: MenuOption[];
};
type TriggerType = 'any_message' | 'keyword' | 'greeting' | 'away' | 'menu';
type MenuOption = { key: string; title: string; reply: string };
const DEFAULT_MENU: MenuOption[] = [
  {
    key: '1',
    title: 'Accounts',
    reply:
      'Our accounts team will help with payments and invoices. Please share your project name or invoice number.',
  },
  {
    key: '2',
    title: 'New project / quote',
    reply:
      'Great! Please share your city, property type (2BHK/3BHK/villa) and budget. Our designer will call you.',
  },
  {
    key: '3',
    title: 'Ongoing project support',
    reply:
      'Please share your project name and the issue. Your project coordinator will get back to you today.',
  },
];
type Schedule = {
  timezone: string;
  days: number[];
  start: string;
  end: string;
};
type QuickReply = { id: string; shortcut: string; body: string };
type Label = { id: string; name: string; color: string };
type BroadcastRow = {
  id: string;
  name: string;
  template_name: string;
  language: string;
  status:
    | 'verifying'
    | 'sending'
    | 'paused_billing'
    | 'paused_error'
    | 'completed'
    | 'cancelled';
  total: number;
  skipped: number;
  created_at: string;
  stats: {
    queued: number;
    sent: number;
    delivered: number;
    read: number;
    failed: number;
    cancelled: number;
  };
  errors?: Record<string, number>;
};
const LABEL_COLORS = [
  '#88352B',
  '#0F766E',
  '#1D4ED8',
  '#B45309',
  '#7C3AED',
  '#BE185D',
  '#15803D',
  '#475569',
];

function useLabels(connectionId: string) {
  const [labels, setLabels] = useState<Label[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string[]>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const reload = useCallback(async () => {
    const params = new URLSearchParams(
      connectionId ? { connectionId } : undefined,
    );
    const response = await fetch(`/api/whatsapp/labels?${params}`, {
      cache: 'no-store',
    });
    const data = (await readApiResponse(response)) as {
      labels?: Label[];
      assignments?: Record<string, string[]>;
      counts?: Record<string, number>;
    };
    if (!response.ok) return;
    setLabels(data.labels ?? []);
    setAssignments(data.assignments ?? {});
    setCounts(data.counts ?? {});
  }, [connectionId]);
  useEffect(() => {
    void reload().catch(() => undefined);
  }, [reload]);
  async function createLabel(name: string, color: string) {
    const response = await fetch('/api/whatsapp/labels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', name, color }),
    });
    const data = (await readApiResponse(response)) as {
      id?: string;
      message?: string;
    };
    if (!response.ok) throw new Error(data.message ?? 'Could not add label.');
    await reload();
    return data.id ?? '';
  }
  async function toggleLabel(contactId: string, labelId: string, on: boolean) {
    setAssignments((value) => ({
      ...value,
      [contactId]: on
        ? [...(value[contactId] ?? []), labelId]
        : (value[contactId] ?? []).filter((id) => id !== labelId),
    }));
    await fetch('/api/whatsapp/labels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'assign', contactId, labelId, on }),
    });
    await reload();
  }
  async function deleteLabel(id: string) {
    await fetch('/api/whatsapp/labels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id }),
    });
    await reload();
  }
  return {
    labels,
    assignments,
    counts,
    reload,
    createLabel,
    toggleLabel,
    deleteLabel,
  };
}

function LabelChip({ label }: { label: Label }) {
  return (
    <span
      className="wa-label-chip"
      style={{ background: `${label.color}1a`, color: label.color }}
    >
      <i style={{ background: label.color }} />
      {label.name}
    </span>
  );
}
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DEFAULT_SCHEDULE: Schedule = {
  timezone: 'Asia/Kolkata',
  days: [1, 2, 3, 4, 5, 6],
  start: '09:00',
  end: '19:00',
};

function triggerLabel(rule: Rule) {
  if (rule.trigger_type === 'keyword')
    return `Keyword contains “${rule.keyword}”`;
  if (rule.trigger_type === 'greeting')
    return 'Greeting · first message, or after 14 days without messages';
  if (rule.trigger_type === 'menu')
    return `Menu · ${(rule.menu ?? []).length} options · first message, or when the customer types MENU or 0`;
  if (rule.trigger_type === 'away') {
    const sched = { ...DEFAULT_SCHEDULE, ...(rule.schedule ?? {}) };
    const days = sched.days.map((d) => WEEKDAYS[d]).join(', ');
    return `Away · outside ${days} ${sched.start}–${sched.end} (India time)`;
  }
  return 'Any message · once per customer every 24 hours';
}
type Tab =
  | 'overview'
  | 'inbox'
  | 'calling'
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

const AVATAR_COLORS = [
  '#00a884',
  '#53bdeb',
  '#ff7f50',
  '#a78bfa',
  '#f59e0b',
  '#ef4444',
  '#10b981',
  '#6366f1',
];
function avatarColor(seed: string) {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]!;
}

/** WhatsApp list time: clock today, "Yesterday", weekday this week, else date. */
function chatListTime(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return '';
  const label = dayLabel(value);
  if (label === 'Today') return clockTime(value);
  if (label === 'Yesterday') return 'Yesterday';
  const days = (Date.now() - date.valueOf()) / 86400000;
  if (days < 7)
    return new Intl.DateTimeFormat('en-IN', { weekday: 'long' }).format(date);
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }).format(date);
}

function clockTime(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? ''
    : new Intl.DateTimeFormat('en-IN', {
        hour: 'numeric',
        minute: '2-digit',
      }).format(date);
}

function dayLabel(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return '';
  const start = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).valueOf();
  const days = Math.round((start(new Date()) - start(date)) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'long',
    year: days > 300 ? 'numeric' : undefined,
  }).format(date);
}

/** WhatsApp-style delivery ticks for outbound messages. */
function StatusTicks({ status }: { status: string }) {
  if (status === 'sending')
    return (
      <span aria-label="Sending" title="Sending">
        🕓
      </span>
    );
  if (status === 'failed')
    return (
      <span aria-label="Not sent" title="Not sent">
        ⚠
      </span>
    );
  const label =
    status === 'read' ? 'Read' : status === 'delivered' ? 'Delivered' : 'Sent';
  return (
    <span
      aria-label={label}
      title={label}
      className={`wa-ticks${status === 'read' ? ' wa-ticks-read' : ''}`}
    >
      {status === 'read' || status === 'delivered' ? '✓✓' : '✓'}
    </span>
  );
}

let incomingAudio: AudioContext | null = null;
/** Short two-note chime; no audio file needed. */
function playIncomingTone() {
  try {
    const AudioCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtor) return;
    incomingAudio ??= new AudioCtor();
    const ctx = incomingAudio;
    [880, 1320].forEach((frequency, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const at = ctx.currentTime + index * 0.12;
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.18, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.2);
    });
  } catch {
    // Audio can be blocked until the user interacts with the page.
  }
}

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
  connections: allConnections,
  canManage,
  settingsPanel,
}: {
  connections: Connection[];
  canManage: boolean;
  settingsPanel?: ReactNode;
}) {
  // Disconnected rows are kept for message history but are not offered as
  // live numbers; fall back to them only when nothing is connected.
  const liveConnections = allConnections.filter(
    (item) => item.status === 'connected',
  );
  const connections = liveConnections.length ? liveConnections : allConnections;
  const [tab, setTab] = useState<Tab>('inbox');
  // Full-screen WhatsApp workspace (remembered per browser), like WhatsApp Web.
  const [fullscreen, setFullscreen] = useState(true);
  const [fullscreenLoaded, setFullscreenLoaded] = useState(false);
  useEffect(() => {
    try {
      if (window.localStorage.getItem('wa-fullscreen') === 'off')
        setFullscreen(false);
    } catch {
      // Storage unavailable: keep full screen.
    }
    setFullscreenLoaded(true);
  }, []);
  useEffect(() => {
    if (!fullscreenLoaded) return;
    try {
      window.localStorage.setItem('wa-fullscreen', fullscreen ? 'on' : 'off');
    } catch {
      // Storage can be unavailable (private mode); the toggle still works.
    }
    if (!fullscreen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [fullscreen, fullscreenLoaded]);
  const [connectionId, setConnectionId] = useState(connections[0]?.id ?? '');
  const [callTarget, setCallTarget] = useState('');
  const [callInProgress, setCallInProgress] = useState(false);
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
    { id: 'calling', label: 'Calls', icon: 'phone' },
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
          confirmOptIn: true,
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
    <section
      className={`wa-shell wa-skin${tab === 'inbox' ? ' wa-skin-inbox' : ''}${fullscreen ? ' wa-fullscreen' : ''}`}
    >
      <aside className="wa-sidebar" aria-label="ProPulse messaging navigation">
        <a
          className="wa-back-link"
          href="/dashboard"
          title="Back to Business OS"
          aria-label="Back to Business OS"
        >
          <NavIcon kind="back" />
          <span className="wa-nav-text">Business OS</span>
        </a>
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
            title="Overview"
            onClick={() => setTab('overview')}
          >
            <NavIcon kind="overview" />{' '}
            <span className="wa-nav-text">Overview</span>
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
              title={item.label}
              className={`wa-nav-item ${tab === item.id ? 'wa-nav-item-active' : ''}`}
            >
              <NavIcon kind={item.icon} />{' '}
              <span className="wa-nav-text">{item.label}</span>
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
              <h1>
                {tab === 'inbox'
                  ? 'WhatsApp Inbox'
                  : `WhatsApp · ${tab === 'overview' ? 'Overview' : (tabs.find((item) => item.id === tab)?.label ?? '')}`}
              </h1>
              <p>Team conversations and customer care</p>
            </div>
          </div>
          <div className="wa-topbar-actions">
            <label className="wa-connection-select">
              <span aria-hidden="true">▦</span>
              <select
                value={connectionId}
                disabled={callInProgress}
                title={
                  callInProgress
                    ? 'End the WhatsApp call before switching business numbers.'
                    : undefined
                }
                onChange={(event) => {
                  setConnectionId(event.target.value);
                  setCallTarget('');
                }}
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
              aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
              title={fullscreen ? 'Exit full screen' : 'Full screen'}
              onClick={() => setFullscreen((value) => !value)}
            >
              <NavIcon kind={fullscreen ? 'collapse' : 'expand'} />
            </button>
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
          <WhatsAppCalling
            key={connectionId}
            connectionId={connectionId}
            selectedWaId={callTarget}
            active={tab === 'calling'}
            canManage={canManage}
            onOpen={() => setTab('calling')}
            onCallActivityChange={setCallInProgress}
          />
          <div
            className={`wa-section-heading${tab === 'inbox' ? ' wa-hidden-on-inbox' : ''}`}
          >
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
                  consentSource: 'Customer enquiry form',
                  confirmOptIn: true,
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
                  consentSource:
                    contact.template_opt_in_source || 'Customer enquiry form',
                  confirmOptIn: true,
                })
              }
              onNavigate={setTab}
              onCallContact={(waId) => {
                setCallTarget(waId);
                setTab('calling');
              }}
            />
          )}
          {tab === 'contacts' && (
            <ContactsPanel
              connectionId={connectionId}
              refreshKey={contactRefresh}
              canManage={canManage}
              onAddContact={() =>
                setContactModal({
                  name: '',
                  phone: '',
                  consentSource: 'Customer enquiry form',
                  confirmOptIn: true,
                })
              }
              onEditContact={(contact, resume) =>
                setContactModal({
                  name: contact.name,
                  phone: `+${contact.wa_id}`,
                  consentSource: resume
                    ? 'Customer asked to receive messages again'
                    : contact.template_opt_in_source || 'Customer enquiry form',
                  confirmOptIn: true,
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
            <BroadcastsPanel
              templates={templates}
              onNavigate={setTab}
              connectionId={connectionId}
              canManage={canManage}
            />
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
              Saving records that this customer agreed to WhatsApp messages from
              you, for example by filling your enquiry form. If they ask to
              stop, use Opt out on the contact.
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
              Where did they agree?
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
            <div className="wa-modal-actions">
              <button
                type="button"
                className="wa-modal-cancel"
                onClick={() => setContactModal(null)}
              >
                Cancel
              </button>
              <button className="wa-new-message" disabled={contactSaving}>
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
    back: <path d="M15 18 9 12l6-6" />,
    expand: (
      <>
        <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
      </>
    ),
    collapse: (
      <>
        <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
      </>
    ),
    refresh: (
      <>
        <path d="M21 12a9 9 0 1 1-2.6-6.4" />
        <path d="M21 3v6h-6" />
      </>
    ),
    tag: (
      <>
        <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" />
        <circle cx="7.5" cy="7.5" r="1.5" />
      </>
    ),
    more: (
      <>
        <circle cx="12" cy="5" r="1.4" />
        <circle cx="12" cy="12" r="1.4" />
        <circle cx="12" cy="19" r="1.4" />
      </>
    ),
    close: <path d="M18 6 6 18M6 6l12 12" />,
    plus: <path d="M12 5v14M5 12h14" />,
    smile: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M8 14s1.5 2 4 2 4-2 4-2" />
        <path d="M9 9.5h.01M15 9.5h.01" />
      </>
    ),
    send: <path d="M4 12 20 4l-4 16-4-6-8-2z" />,
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
    phone: (
      <>
        <path d="M22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7l.5 3.2a2 2 0 0 1-.6 1.7L7.1 10.5a16 16 0 0 0 6.4 6.4l1.9-1.9a2 2 0 0 1 1.7-.6l3.2.5a2 2 0 0 1 1.7 2z" />
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
  const load = useCallback(
    async (quiet = false) => {
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
    },
    [connectionId, search, section],
  );
  useEffect(() => {
    void load();
  }, [load, refreshKey]);
  return { rows, total, unread, search, setSearch, busy, error, reload: load };
}

function InboxPanel({
  connectionId,
  canManage,
  refreshKey,
  onEditContact,
  onNavigate,
  onCallContact,
}: {
  connectionId: string;
  canManage: boolean;
  refreshKey: number;
  onEditContact: (contact: Contact) => void;
  onNavigate: (tab: Tab) => void;
  onCallContact: (waId: string) => void;
}) {
  const state = useWorkspaceRows('inbox', connectionId, refreshKey);
  const [selected, setSelected] = useState('');
  const [thread, setThread] = useState<Message[]>([]);
  const historyRef = useRef<HTMLDivElement | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const [attachMenu, setAttachMenu] = useState(false);
  const cameraInput = useRef<HTMLInputElement>(null);
  const [richForm, setRichForm] = useState<
    | null
    | {
        kind: 'location';
        name: string;
        address: string;
        lat: string;
        lng: string;
      }
    | { kind: 'contacts'; name: string; phone: string }
    | { kind: 'buttons'; question: string; options: string[] }
  >(null);
  const [locating, setLocating] = useState(false);
  const [contact, setContact] = useState<Contact | null>(null);
  const [body, setBody] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const attachmentUrl = useMemo(
    () => (attachment ? URL.createObjectURL(attachment) : ''),
    [attachment],
  );
  useEffect(
    () => () => {
      if (attachmentUrl) URL.revokeObjectURL(attachmentUrl);
    },
    [attachmentUrl],
  );
  const fileInput = useRef<HTMLInputElement>(null);
  const [conversationFilter, setConversationFilter] = useState<
    'all' | 'unread'
  >('all');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState<Message[]>([]);
  const { replies: quickReplies } = useQuickReplies();
  const labelState = useLabels(connectionId);
  const [labelFilter, setLabelFilter] = useState('');
  const [labelMenuOpen, setLabelMenuOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const selectedRef = useRef('');
  const lastReceiptRef = useRef('');
  const lastTypingRef = useRef(0);
  const newestInboundRef = useRef<string | null>(null);
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  useEffect(() => {
    setAlertsEnabled(
      typeof Notification === 'undefined' ||
        Notification.permission === 'granted',
    );
  }, []);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  const sendReceipt = useCallback(
    (waId: string, typing = false) => {
      if (!canManage || !waId) return;
      void fetch('/api/whatsapp/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId, waId, typing }),
      }).catch(() => undefined);
    },
    [canManage, connectionId],
  );

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
      // Ignore a late response for a chat the user has already left.
      if (selectedRef.current && selectedRef.current !== waId) return;
      const rows = data.rows ?? [];
      setThread(rows);
      setContact(data.contact ?? null);
      // Blue ticks for the customer once their newest message is on screen.
      const newestInbound = [...rows]
        .reverse()
        .find((row) => row.direction === 'inbound');
      if (
        newestInbound &&
        document.visibilityState === 'visible' &&
        lastReceiptRef.current !== newestInbound.provider_id
      ) {
        lastReceiptRef.current = newestInbound.provider_id;
        sendReceipt(waId);
      }
    },
    [connectionId, sendReceipt],
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
    // Scroll only the chat box, never the whole page (WhatsApp behaviour).
    const box = historyRef.current;
    if (box) box.scrollTo({ top: box.scrollHeight, behavior: 'smooth' });
  }, [thread, pending]);

  useEffect(() => {
    if (!connectionId) return;
    const database = createBrowserDatabase();
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const refreshInbox = () => {
      if (document.visibilityState !== 'visible') return;
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        void state.reload(true);
        if (selected) void loadThread(selected).catch(() => undefined);
      }, 80);
    };
    const channel = database
      .channel(`whatsapp-inbox-${connectionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'whatsapp_messages',
          filter: `connection_id=eq.${connectionId}`,
        },
        refreshInbox,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'whatsapp_contacts',
          filter: `connection_id=eq.${connectionId}`,
        },
        refreshInbox,
      )
      .subscribe();
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      void database.removeChannel(channel);
    };
  }, [connectionId, loadThread, selected, state.reload]);

  // Safety net if a realtime event is missed (network change, sleep, proxy).
  useEffect(() => {
    if (!connectionId) return;
    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void state.reload(true);
      if (selectedRef.current)
        void loadThread(selectedRef.current).catch(() => undefined);
    }, 4000);
    return () => clearInterval(timer);
  }, [connectionId, loadThread, state.reload]);

  // New-message alert: sound, tab title and optional desktop notification.
  useEffect(() => {
    const newest = state.rows
      .filter((row) => row.last_direction === 'inbound')
      .map((row) => row.last_message_at)
      .sort()
      .at(-1);
    if (!newest) return;
    const previous = newestInboundRef.current;
    newestInboundRef.current = newest;
    if (!previous || newest <= previous) return;
    const row = state.rows.find((item) => item.last_message_at === newest);
    playIncomingTone();
    if (
      document.visibilityState !== 'visible' &&
      typeof Notification !== 'undefined' &&
      Notification.permission === 'granted' &&
      row
    ) {
      new Notification(row.name || `+${row.wa_id}`, {
        body:
          whatsappMessagePreview(row.last_message) || 'New WhatsApp message',
        tag: `wa-${row.wa_id}`,
      });
    }
  }, [state.rows]);
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\) /, '');
    document.title = state.unread ? `(${state.unread}) ${base}` : base;
    return () => {
      document.title = document.title.replace(/^\(\d+\) /, '');
    };
  }, [state.unread]);

  async function markRead(waId: string) {
    await fetch('/api/whatsapp/inbox', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'read', connectionId, waId }),
    });
    await state.reload();
  }

  function onComposerChange(value: string) {
    setBody(value);
    if (!contact || !value.trim()) return;
    if (Date.now() - lastTypingRef.current < 20000) return;
    lastTypingRef.current = Date.now();
    sendReceipt(contact.wa_id, true);
  }

  async function sendReply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!contact || (!body.trim() && !attachment)) return;
    // Show the message at once, like WhatsApp, and send in the background.
    const text = body.trim();
    const file = attachment;
    const waId = contact.wa_id;
    const tempId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setPending((list) => [
      ...list,
      {
        id: tempId,
        provider_id: '',
        direction: 'outbound',
        type: file ? 'document' : 'text',
        body: file ? `📎 ${file.name}${text ? `\n${text}` : ''}` : text,
        status: 'sending',
        error_code: '',
        occurred_at: new Date().toISOString(),
        local: true,
        waId,
      },
    ]);
    setBody('');
    setAttachment(null);
    setNotice('');
    lastTypingRef.current = 0;
    try {
      let payload: Record<string, unknown> = {
        messageType: 'text',
        connectionId,
        to: `+${waId}`,
        body: text,
      };
      if (file) {
        const form = new FormData();
        form.append('connectionId', connectionId);
        form.append('file', file);
        const uploadResponse = await fetch('/api/whatsapp/media', {
          method: 'POST',
          body: form,
        });
        const uploaded = (await readApiResponse(uploadResponse)) as {
          mediaId?: string;
          mediaType?: string;
          fileName?: string;
          message?: string;
        };
        if (!uploadResponse.ok || !uploaded.mediaId || !uploaded.mediaType)
          throw new Error(uploaded.message ?? 'Attachment upload failed.');
        payload = {
          messageType: 'media',
          connectionId,
          to: `+${waId}`,
          mediaId: uploaded.mediaId,
          mediaType: uploaded.mediaType,
          filename: uploaded.fileName,
          caption: text,
        };
      }
      const response = await fetch('/api/whatsapp/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = (await readApiResponse(response)) as { message?: string };
      if (!response.ok)
        throw new Error(result.message ?? 'Reply could not be sent.');
      await loadThread(waId).catch(() => undefined);
      setPending((list) => list.filter((item) => item.id !== tempId));
      void state.reload(true);
    } catch (error) {
      const reason = friendlyError(error, 'Reply could not be sent.');
      setPending((list) =>
        list.map((item) =>
          item.id === tempId
            ? { ...item, status: 'failed', error_code: reason }
            : item,
        ),
      );
    }
  }

  async function sendRich() {
    if (!contact || !richForm) return;
    const waId = contact.wa_id;
    let payload: Record<string, unknown>;
    let preview: string;
    if (richForm.kind === 'location') {
      const latitude = Number(richForm.lat);
      const longitude = Number(richForm.lng);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        setNotice(
          'Press “Use my location” or type the latitude and longitude.',
        );
        return;
      }
      payload = {
        messageType: 'location',
        latitude,
        longitude,
        name: richForm.name,
        address: richForm.address,
      };
      preview = `📍 ${richForm.name || 'Location'}`;
    } else if (richForm.kind === 'contacts') {
      const digits = richForm.phone.replace(/\D/g, '');
      const phone = /^[6-9]\d{9}$/.test(digits) ? `91${digits}` : digits;
      payload = { messageType: 'contacts', name: richForm.name, phone };
      preview = `👤 Contact: ${richForm.name}`;
    } else {
      const options = richForm.options.map((o) => o.trim()).filter(Boolean);
      payload = {
        messageType: 'buttons',
        question: richForm.question,
        options,
      };
      preview = `📊 ${richForm.question}\n${options.map((o, i) => `${i + 1}. ${o}`).join('\n')}`;
    }
    const tempId = `local-${Date.now()}`;
    setPending((list) => [
      ...list,
      {
        id: tempId,
        provider_id: '',
        direction: 'outbound',
        type: richForm.kind,
        body: preview,
        status: 'sending',
        error_code: '',
        occurred_at: new Date().toISOString(),
        local: true,
        waId,
      },
    ]);
    setRichForm(null);
    try {
      const response = await fetch('/api/whatsapp/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, connectionId, to: `+${waId}` }),
      });
      const result = (await readApiResponse(response)) as { message?: string };
      if (!response.ok) throw new Error(result.message ?? 'Not sent.');
      await loadThread(waId).catch(() => undefined);
      setPending((list) => list.filter((item) => item.id !== tempId));
    } catch (error) {
      const reason = friendlyError(error, 'Not sent.');
      setPending((list) =>
        list.map((item) =>
          item.id === tempId
            ? { ...item, status: 'failed', error_code: reason }
            : item,
        ),
      );
    }
  }

  function locateMe() {
    if (!navigator.geolocation || richForm?.kind !== 'location') return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        setRichForm((form) =>
          form && form.kind === 'location'
            ? {
                ...form,
                lat: position.coords.latitude.toFixed(6),
                lng: position.coords.longitude.toFixed(6),
              }
            : form,
        );
      },
      () => {
        setLocating(false);
        setNotice('Location permission was not given. Type the place instead.');
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
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

  const visibleRows = (
    conversationFilter === 'unread'
      ? state.rows.filter((row) => row.unread)
      : state.rows
  ).filter(
    (row) =>
      !labelFilter ||
      (labelState.assignments[row.id] ?? []).includes(labelFilter),
  );
  const labelById = new Map(
    labelState.labels.map((label) => [label.id, label]),
  );

  return (
    <div
      className={`wa-inbox-grid${showProfile ? ' wa-inbox-with-profile' : ''}`}
    >
      <aside className="wa-conversation-panel">
        <div className="wa-conversation-toolbar">
          <div className="wa-chats-head">
            <h3>Chats</h3>
            <div className="flex items-center gap-1">
              {!alertsEnabled && (
                <button
                  type="button"
                  className="wa-round-icon"
                  title="Turn on desktop alerts for new messages"
                  aria-label="Turn on desktop alerts"
                  onClick={() =>
                    void Notification.requestPermission().then((result) =>
                      setAlertsEnabled(result === 'granted'),
                    )
                  }
                >
                  <NavIcon kind="bell" />
                </button>
              )}
              <button
                type="button"
                className="wa-round-icon"
                title="Refresh"
                aria-label="Refresh chats"
                onClick={() => void state.reload()}
                disabled={state.busy}
              >
                <NavIcon kind="refresh" />
              </button>
            </div>
          </div>
          <label className="wa-search">
            <NavIcon kind="search" />
            <input
              value={state.search}
              onChange={(event) =>
                setStateSearch(state.setSearch, event.target.value)
              }
              placeholder="Search or start a new chat"
              aria-label="Search conversations"
            />
          </label>
          <div
            className="wa-chips"
            role="tablist"
            aria-label="Conversation filters"
          >
            <button
              type="button"
              className={
                conversationFilter === 'all' && !labelFilter
                  ? 'wa-chip-active'
                  : ''
              }
              onClick={() => {
                setConversationFilter('all');
                setLabelFilter('');
              }}
            >
              All
            </button>
            <button
              type="button"
              className={
                conversationFilter === 'unread' ? 'wa-chip-active' : ''
              }
              onClick={() => setConversationFilter('unread')}
            >
              Unread{state.unread ? ` ${state.unread}` : ''}
            </button>
            {labelState.labels.map((label) => (
              <button
                key={label.id}
                type="button"
                className={labelFilter === label.id ? 'wa-chip-active' : ''}
                onClick={() =>
                  setLabelFilter((value) =>
                    value === label.id ? '' : label.id,
                  )
                }
              >
                {label.name}
              </button>
            ))}
          </div>
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
          {visibleRows.map((row) => {
            const rowLabels = (labelState.assignments[row.id] ?? [])
              .map((id) => labelById.get(id))
              .filter((label): label is Label => !!label);
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => {
                  setSelected(row.wa_id);
                  if (canManage) void markRead(row.wa_id);
                }}
                className={`wa-chat-row${selected === row.wa_id ? ' wa-chat-row-active' : ''}`}
              >
                <span
                  className="wa-avatar"
                  style={{ background: avatarColor(row.wa_id) }}
                >
                  {(row.name || row.wa_id).slice(0, 1).toUpperCase()}
                </span>
                <span className="wa-chat-body">
                  <span className="wa-chat-top">
                    <strong>{row.name || `+${row.wa_id}`}</strong>
                    <time className={row.unread ? 'wa-time-unread' : ''}>
                      {chatListTime(row.last_message_at)}
                    </time>
                  </span>
                  <span className="wa-chat-bottom">
                    <span className="wa-chat-preview">
                      {row.last_direction === 'outbound' && (
                        <StatusTicks status={row.last_status || 'sent'} />
                      )}{' '}
                      {whatsappMessagePreview(row.last_message) ||
                        'No messages yet'}
                    </span>
                    {row.opted_out && (
                      <span className="wa-mini-tag wa-mini-tag-red">
                        Opted out
                      </span>
                    )}
                    {rowLabels.slice(0, 1).map((label) => (
                      <LabelChip key={label.id} label={label} />
                    ))}
                    {row.unread && <span className="wa-unread-badge">1</span>}
                  </span>
                </span>
              </button>
            );
          })}
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
              <button
                type="button"
                className="wa-thread-who"
                onClick={() => setShowProfile((open) => !open)}
                title="Contact info"
              >
                <span
                  className="wa-avatar"
                  style={{ background: avatarColor(contact.wa_id) }}
                >
                  {(contact.name || contact.wa_id).slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 text-left">
                  <strong className="block truncate">
                    {contact.name || `+${contact.wa_id}`}
                  </strong>
                  <small className="block truncate">
                    {(labelState.assignments[contact.id] ?? [])
                      .map((id) => labelById.get(id)?.name)
                      .filter(Boolean)
                      .join(' · ') ||
                      `+${contact.wa_id} · click for contact info`}
                  </small>
                </span>
              </button>
              <div className="flex items-center gap-1">
                {canManage && (
                  <button
                    type="button"
                    className="wa-round-icon"
                    onClick={() => onCallContact(contact.wa_id)}
                    aria-label="Call this WhatsApp contact"
                    title="Voice call"
                  >
                    <NavIcon kind="phone" />
                  </button>
                )}
                <div className="relative">
                  <button
                    type="button"
                    className="wa-round-icon"
                    aria-label="Labels for this chat"
                    aria-expanded={labelMenuOpen}
                    title="Labels"
                    onClick={() => setLabelMenuOpen((open) => !open)}
                  >
                    <NavIcon kind="tag" />
                  </button>
                  {labelMenuOpen && (
                    <div className="wa-label-menu" role="menu">
                      <p className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-wide text-stone-400">
                        Label this chat
                      </p>
                      {labelState.labels.map((label) => {
                        const on = (
                          labelState.assignments[contact.id] ?? []
                        ).includes(label.id);
                        return (
                          <label key={label.id} className="wa-label-option">
                            <input
                              type="checkbox"
                              checked={on}
                              disabled={!canManage}
                              onChange={() =>
                                void labelState.toggleLabel(
                                  contact.id,
                                  label.id,
                                  !on,
                                )
                              }
                            />
                            <LabelChip label={label} />
                          </label>
                        );
                      })}
                      {canManage && (
                        <form
                          className="flex gap-1 border-t border-stone-100 p-2"
                          onSubmit={(event) => {
                            event.preventDefault();
                            const name = newLabel.trim();
                            if (!name) return;
                            const color =
                              LABEL_COLORS[
                                labelState.labels.length % LABEL_COLORS.length
                              ]!;
                            void labelState
                              .createLabel(name, color)
                              .then((id) => {
                                setNewLabel('');
                                if (id)
                                  return labelState.toggleLabel(
                                    contact.id,
                                    id,
                                    true,
                                  );
                              })
                              .catch((error: unknown) =>
                                setNotice(
                                  friendlyError(error, 'Could not add label.'),
                                ),
                              );
                          }}
                        >
                          <input
                            className={field}
                            maxLength={40}
                            placeholder="New label, e.g. Hot lead"
                            value={newLabel}
                            onChange={(event) =>
                              setNewLabel(event.target.value)
                            }
                          />
                          <button className={softButton}>Add</button>
                        </form>
                      )}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className="wa-round-icon"
                  aria-label="Contact info"
                  title="Contact info"
                  onClick={() => setShowProfile((open) => !open)}
                >
                  <NavIcon kind="more" />
                </button>
              </div>
            </header>
            <div className="wa-message-history" ref={historyRef}>
              {thread.length === 0 &&
                !pending.some((item) => item.waId === contact.wa_id) && (
                  <p className="rounded-xl bg-white p-4 text-sm text-stone-500">
                    No messages in this conversation yet.
                  </p>
                )}
              {[
                ...thread,
                ...pending.filter((item) => item.waId === contact.wa_id),
              ].map((item, index, all) => {
                const day = dayLabel(item.occurred_at);
                const showDay =
                  index === 0 || dayLabel(all[index - 1]!.occurred_at) !== day;
                return (
                  <Fragment key={item.id}>
                    {showDay && (
                      <div className="wa-day-separator">
                        <span>{day}</span>
                      </div>
                    )}
                    <div
                      className={`flex ${item.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
                    >
                      <article
                        className={`wa-message-bubble ${item.direction === 'outbound' ? 'wa-message-out' : 'wa-message-in'}${item.status === 'failed' ? ' wa-message-failed' : ''}`}
                      >
                        <MessageBody
                          message={item}
                          connectionId={connectionId}
                        />
                        <p className="wa-message-meta">
                          <span>{clockTime(item.occurred_at)}</span>
                          {item.direction === 'outbound' && (
                            <StatusTicks status={item.status} />
                          )}
                        </p>
                        {item.status === 'failed' && (
                          <p className="wa-message-error">
                            Not sent
                            {(() => {
                              const help = item.local
                                ? null
                                : whatsappErrorHelp(item.error_code);
                              if (!help)
                                return item.error_code
                                  ? ` · ${item.error_code}`
                                  : '';
                              return (
                                <>
                                  {` · ${help.reason}. `}
                                  {help.link && (
                                    <a
                                      className="underline"
                                      href={help.link.href}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      {help.link.label} ↗
                                    </a>
                                  )}
                                </>
                              );
                            })()}
                            {item.local && (
                              <button
                                type="button"
                                className="ml-2 underline"
                                onClick={() =>
                                  setPending((list) =>
                                    list.filter((row) => row.id !== item.id),
                                  )
                                }
                              >
                                Dismiss
                              </button>
                            )}
                          </p>
                        )}
                      </article>
                    </div>
                  </Fragment>
                );
              })}
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
                  {(() => {
                    const match = /^\/([a-z0-9_-]*)$/i.exec(body);
                    if (!match) return null;
                    const query = match[1]!.toLowerCase();
                    const options = quickReplies
                      .filter((reply) => reply.shortcut.startsWith(query))
                      .slice(0, 6);
                    return (
                      <div className="wa-quick-replies" role="listbox">
                        {options.length === 0 ? (
                          <p className="px-3 py-2 text-xs text-stone-500">
                            No quick reply starts with /{query}. Add them under
                            Automations.
                          </p>
                        ) : (
                          options.map((reply) => (
                            <button
                              key={reply.id}
                              type="button"
                              role="option"
                              aria-selected={false}
                              onClick={() =>
                                setBody(
                                  reply.body.replace(
                                    /\{\{name\}\}/gi,
                                    contact.name || 'there',
                                  ),
                                )
                              }
                            >
                              <strong>/{reply.shortcut}</strong>
                              <span>{reply.body}</span>
                            </button>
                          ))
                        )}
                      </div>
                    );
                  })()}
                  <div className="wa-composer-row">
                    <div className="relative">
                      <button
                        type="button"
                        className="wa-composer-attachment"
                        aria-label="Attach a photo, video or document"
                        aria-expanded={attachMenu}
                        title="Attach"
                        disabled={busy}
                        onClick={() => setAttachMenu((open) => !open)}
                      >
                        <NavIcon kind="plus" />
                      </button>
                      {attachMenu && (
                        <div className="wa-attach-menu" role="menu">
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setAttachMenu(false);
                              photoInput.current?.click();
                            }}
                          >
                            <span className="wa-attach-icon wa-attach-photo">
                              🖼
                            </span>
                            Photos &amp; videos
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setAttachMenu(false);
                              cameraInput.current?.click();
                            }}
                          >
                            <span className="wa-attach-icon wa-attach-camera">
                              📷
                            </span>
                            Camera
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setAttachMenu(false);
                              fileInput.current?.click();
                            }}
                          >
                            <span className="wa-attach-icon wa-attach-doc">
                              📄
                            </span>
                            Document
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setAttachMenu(false);
                              setRichForm({
                                kind: 'location',
                                name: '',
                                address: '',
                                lat: '',
                                lng: '',
                              });
                            }}
                          >
                            <span className="wa-attach-icon wa-attach-location">
                              📍
                            </span>
                            Location
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setAttachMenu(false);
                              setRichForm({
                                kind: 'contacts',
                                name: '',
                                phone: '',
                              });
                            }}
                          >
                            <span className="wa-attach-icon wa-attach-contact">
                              👤
                            </span>
                            Contact
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setAttachMenu(false);
                              setRichForm({
                                kind: 'buttons',
                                question: '',
                                options: ['', ''],
                              });
                            }}
                          >
                            <span className="wa-attach-icon wa-attach-poll">
                              📊
                            </span>
                            Quick question (poll)
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            disabled
                            title="Needs a product catalog connected in Meta Commerce Manager"
                          >
                            <span className="wa-attach-icon wa-attach-catalog">
                              🛍
                            </span>
                            Catalog (needs Meta catalog)
                          </button>
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      className="wa-composer-template"
                      onClick={() => onNavigate('templates')}
                    >
                      Templates
                    </button>
                    <label className="wa-composer-input">
                      <span className="sr-only">Write a WhatsApp reply</span>
                      <textarea
                        id="whatsapp-reply"
                        rows={1}
                        maxLength={4096}
                        value={body}
                        onChange={(event) =>
                          onComposerChange(event.target.value)
                        }
                        onKeyDown={(event) => {
                          if (
                            event.key === 'Enter' &&
                            !event.shiftKey &&
                            !event.nativeEvent.isComposing
                          ) {
                            event.preventDefault();
                            event.currentTarget.form?.requestSubmit();
                          }
                        }}
                        placeholder="Type a message…"
                      />
                    </label>
                    <button
                      type="button"
                      className="wa-composer-emoji"
                      aria-label="Insert smile emoji"
                      onClick={() => setBody((value) => `${value}🙂`)}
                    >
                      <NavIcon kind="smile" />
                    </button>
                    <button
                      className="wa-send-button"
                      disabled={!body.trim() && !attachment}
                      aria-label="Send message"
                    >
                      <NavIcon kind="send" />
                    </button>
                  </div>
                  <input
                    ref={fileInput}
                    type="file"
                    hidden
                    accept="audio/aac,audio/mp4,audio/mpeg,audio/amr,audio/ogg,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,text/csv"
                    onChange={(event) => {
                      setAttachment(event.currentTarget.files?.[0] ?? null);
                      event.currentTarget.value = '';
                    }}
                  />
                  <input
                    ref={cameraInput}
                    type="file"
                    hidden
                    accept="image/*"
                    capture="environment"
                    onChange={(event) => {
                      setAttachment(event.currentTarget.files?.[0] ?? null);
                      event.currentTarget.value = '';
                    }}
                  />
                  {richForm && (
                    <div className="wa-rich-form">
                      <div className="flex items-center justify-between">
                        <strong>
                          {richForm.kind === 'location'
                            ? '📍 Send a location'
                            : richForm.kind === 'contacts'
                              ? '👤 Send a contact'
                              : '📊 Ask a quick question'}
                        </strong>
                        <button
                          type="button"
                          className="wa-round-icon"
                          aria-label="Close"
                          onClick={() => setRichForm(null)}
                        >
                          <NavIcon kind="close" />
                        </button>
                      </div>
                      {richForm.kind === 'location' && (
                        <>
                          <button
                            type="button"
                            className="wa-row-action"
                            onClick={locateMe}
                            disabled={locating}
                          >
                            {locating ? 'Finding…' : '📍 Use my location'}
                          </button>
                          <input
                            placeholder="Place name (e.g. SG Homes office)"
                            value={richForm.name}
                            onChange={(e) =>
                              setRichForm({ ...richForm, name: e.target.value })
                            }
                          />
                          <input
                            placeholder="Address"
                            value={richForm.address}
                            onChange={(e) =>
                              setRichForm({
                                ...richForm,
                                address: e.target.value,
                              })
                            }
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              placeholder="Latitude"
                              inputMode="decimal"
                              value={richForm.lat}
                              onChange={(e) =>
                                setRichForm({
                                  ...richForm,
                                  lat: e.target.value,
                                })
                              }
                            />
                            <input
                              placeholder="Longitude"
                              inputMode="decimal"
                              value={richForm.lng}
                              onChange={(e) =>
                                setRichForm({
                                  ...richForm,
                                  lng: e.target.value,
                                })
                              }
                            />
                          </div>
                        </>
                      )}
                      {richForm.kind === 'contacts' && (
                        <>
                          <input
                            placeholder="Name"
                            value={richForm.name}
                            onChange={(e) =>
                              setRichForm({ ...richForm, name: e.target.value })
                            }
                          />
                          <input
                            placeholder="Phone number"
                            inputMode="tel"
                            value={richForm.phone}
                            onChange={(e) =>
                              setRichForm({
                                ...richForm,
                                phone: e.target.value,
                              })
                            }
                          />
                        </>
                      )}
                      {richForm.kind === 'buttons' && (
                        <>
                          <input
                            placeholder="Question (e.g. When can we visit?)"
                            maxLength={1024}
                            value={richForm.question}
                            onChange={(e) =>
                              setRichForm({
                                ...richForm,
                                question: e.target.value,
                              })
                            }
                          />
                          {richForm.options.map((option, index) => (
                            <input
                              key={index}
                              placeholder={`Answer ${index + 1} (short)`}
                              maxLength={20}
                              value={option}
                              onChange={(e) =>
                                setRichForm({
                                  ...richForm,
                                  options: richForm.options.map((o, i) =>
                                    i === index ? e.target.value : o,
                                  ),
                                })
                              }
                            />
                          ))}
                          {richForm.options.length < 3 && (
                            <button
                              type="button"
                              className="wa-row-action"
                              onClick={() =>
                                setRichForm({
                                  ...richForm,
                                  options: [...richForm.options, ''],
                                })
                              }
                            >
                              + Add answer
                            </button>
                          )}
                          <small className="text-xs text-stone-500">
                            The customer taps one answer. Up to 3 answers.
                          </small>
                        </>
                      )}
                      <button
                        type="button"
                        className="wa-bc-send"
                        disabled={
                          (richForm.kind === 'contacts' &&
                            (!richForm.name.trim() ||
                              richForm.phone.replace(/\D/g, '').length < 10)) ||
                          (richForm.kind === 'buttons' &&
                            (!richForm.question.trim() ||
                              richForm.options.filter((o) => o.trim()).length <
                                2)) ||
                          (richForm.kind === 'location' &&
                            (!richForm.lat || !richForm.lng))
                        }
                        onClick={() => void sendRich()}
                      >
                        Send
                      </button>
                    </div>
                  )}
                  <input
                    ref={photoInput}
                    type="file"
                    hidden
                    accept="image/jpeg,image/png,image/webp,video/mp4,video/3gpp"
                    onChange={(event) => {
                      setAttachment(event.currentTarget.files?.[0] ?? null);
                      event.currentTarget.value = '';
                    }}
                  />
                  {attachment && (
                    <div className="wa-attach-preview">
                      {attachment.type.startsWith('image/') ? (
                        <img src={attachmentUrl} alt={attachment.name} />
                      ) : attachment.type.startsWith('video/') ? (
                        <video src={attachmentUrl} controls muted />
                      ) : attachment.type.startsWith('audio/') ? (
                        <audio src={attachmentUrl} controls />
                      ) : (
                        <div className="wa-doc-card">
                          <span className="wa-doc-icon">
                            {(attachment.name.split('.').pop() ?? 'file')
                              .slice(0, 4)
                              .toUpperCase()}
                          </span>
                          <span className="min-w-0">
                            <strong className="block truncate">
                              {attachment.name}
                            </strong>
                            <small>
                              {Math.max(1, Math.round(attachment.size / 1024))}{' '}
                              KB
                            </small>
                          </span>
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-xs text-stone-500">
                          {attachment.name} · add a caption below, then send
                        </span>
                        <button
                          type="button"
                          className="text-xs font-semibold text-[#88352B]"
                          onClick={() => setAttachment(null)}
                        >
                          ✕ Remove
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-stone-500">
                      Free-form replies work within 24 hours of the customer’s
                      latest message.
                    </p>
                    <span className="text-xs text-stone-400">
                      Enter to send · Shift+Enter for a new line
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
      {showProfile && (
        <div className="wa-profile-drawer">
          <div className="wa-profile-drawer-head">
            <button
              type="button"
              className="wa-round-icon"
              aria-label="Close contact info"
              onClick={() => setShowProfile(false)}
            >
              <NavIcon kind="close" />
            </button>
            <strong>Contact info</strong>
          </div>
          <ContactProfile
            contact={contact}
            onEdit={onEditContact}
            onOptOut={() => void changeOptOut()}
            onNavigate={onNavigate}
          />
        </div>
      )}
    </div>
  );
}

function setStateSearch(set: (value: string) => void, value: string) {
  set(value);
}

function MessageBody({
  message,
  connectionId,
}: {
  message: Message;
  connectionId: string;
}) {
  const match =
    /^\[\[WA_MEDIA:([A-Za-z0-9._-]{1,200}):(image|video|audio|document)\]\](?:\r?\n([\s\S]*))?$/.exec(
      message.body,
    );
  if (!match) {
    const placeholder = whatsappPlaceholderLabel(message.body);
    return (
      <p
        className={`whitespace-pre-wrap break-words text-sm leading-6${placeholder ? ' italic opacity-75' : ''}`}
      >
        {placeholder ?? message.body}
      </p>
    );
  }
  const mediaId = match[1]!;
  const kind = match[2]!;
  const caption = match[3] ?? '';
  const source = `/api/whatsapp/media?connectionId=${encodeURIComponent(connectionId)}&mediaId=${encodeURIComponent(mediaId)}`;
  return (
    <div className="space-y-2">
      {kind === 'image' ? (
        <a href={source} target="_blank" rel="noreferrer">
          <img
            className="max-h-80 max-w-full rounded-lg object-contain"
            src={source}
            alt={caption || 'WhatsApp image'}
            loading="lazy"
          />
        </a>
      ) : kind === 'video' ? (
        <video
          className="max-h-80 max-w-full rounded-lg"
          src={source}
          controls
          preload="metadata"
        />
      ) : kind === 'audio' ? (
        <audio
          className="max-w-full"
          src={source}
          controls
          preload="metadata"
        />
      ) : (
        <a
          className="wa-doc-card"
          href={source}
          target="_blank"
          rel="noreferrer"
        >
          <span className="wa-doc-icon">
            {(
              /\.([a-z0-9]{1,4})$/i.exec(caption.split('\n')[0] ?? '')?.[1] ??
              'DOC'
            ).toUpperCase()}
          </span>
          <span className="min-w-0">
            <strong className="block truncate">
              {caption.split('\n')[0] || 'Document'}
            </strong>
            <small>Tap to open</small>
          </span>
        </a>
      )}
      {caption && kind !== 'document' && (
        <p className="whitespace-pre-wrap break-words text-sm leading-6">
          {caption}
        </p>
      )}
    </div>
  );
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
  connectionId,
  canManage,
}: {
  templates: Template[];
  onNavigate: (tab: Tab) => void;
  connectionId: string;
  canManage: boolean;
}) {
  const approved = templates.filter(
    (template) => template.status === 'APPROVED',
  );
  const labelState = useLabels(connectionId);
  const [rows, setRows] = useState<BroadcastRow[]>([]);
  const [wabaId, setWabaId] = useState('');
  const [name, setName] = useState('');
  const [templateKey, setTemplateKey] = useState('');
  const [values, setValues] = useState<string[]>([]);
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [audienceMode, setAudienceMode] = useState<'labels' | 'contacts'>(
    'labels',
  );
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const contactRows = useWorkspaceRows('contacts', connectionId);
  const [preview, setPreview] = useState<{
    matched: number;
    eligible: number;
    optedOut: number;
    noOptIn: number;
  } | null>(null);
  const [notice, setNotice] = useState('');
  const [sendingId, setSendingId] = useState('');
  const cancelRef = useRef(false);

  const template = approved.find(
    (item) => `${item.name}|${item.language}` === templateKey,
  );
  const bodyText =
    template?.components?.find((component) => component.type === 'BODY')
      ?.text ?? '';
  const needed = Math.max(
    0,
    ...[...bodyText.matchAll(/\{\{(\d+)\}\}/g)].map((match) =>
      Number(match[1]),
    ),
  );

  const load = useCallback(async () => {
    if (!connectionId) return;
    const response = await fetch(
      `/api/whatsapp/broadcasts?${new URLSearchParams({ connectionId })}`,
      { cache: 'no-store' },
    );
    const data = (await readApiResponse(response)) as {
      rows?: BroadcastRow[];
      wabaId?: string;
    };
    if (response.ok) {
      setRows(data.rows ?? []);
      setWabaId(data.wabaId ?? '');
      return data.rows ?? [];
    }
    throw new Error('Could not refresh broadcast status.');
  }, [connectionId]);
  useEffect(() => {
    void load().catch(() => undefined);
  }, [load]);

  useEffect(() => {
    if (!connectionId) return;
    const params = new URLSearchParams({
      connectionId,
      preview: '1',
      mode: audienceMode,
      ...(audienceMode === 'contacts'
        ? { contactIds: pickedIds.join(',') }
        : { labelIds: labelIds.join(',') }),
    });
    let cancelled = false;
    void fetch(`/api/whatsapp/broadcasts?${params}`, { cache: 'no-store' })
      .then((response) => readApiResponse(response))
      .then((data) => {
        if (!cancelled) setPreview(data as typeof preview);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [connectionId, labelIds, audienceMode, pickedIds]);

  async function runSending(id: string) {
    if (sendingId) return;
    setSendingId(id);
    cancelRef.current = false;
    try {
      for (let round = 0; round < 1000 && !cancelRef.current; round += 1) {
        const response = await fetch('/api/whatsapp/broadcasts/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ broadcastId: id }),
        });
        const result = (await readApiResponse(response)) as {
          remaining?: number;
          sent?: number;
          failed?: number;
          status?: BroadcastRow['status'];
          noProgress?: boolean;
          message?: string;
        };
        if (!response.ok)
          throw new Error(result.message ?? 'Broadcast sending stopped.');

        if (result.status === 'paused_billing') {
          setNotice(
            'Billing issue 131042: remaining contacts are safely queued. Add funds or fix the payment method in Meta, then click Resend & Continue.',
          );
          break;
        }
        if (result.status === 'paused_error') {
          setNotice(
            'Verification failed or sending is uncertain. Review failed messages before retrying; accepted messages are never automatically resent.',
          );
          break;
        }
        if (result.status === 'verifying') {
          setNotice(
            'Test message submitted. Waiting for Meta to confirm delivery before sending the rest.',
          );
          let nextStatus: BroadcastRow['status'] = 'verifying';
          // This is cheap status-only polling in the open browser. It stops
          // after 90s; billing holds never trigger repeated send attempts.
          for (let check = 0; check < 30 && !cancelRef.current; check += 1) {
            await new Promise<void>((resolve) => setTimeout(resolve, 3000));
            const poll = await fetch(
              `/api/whatsapp/broadcasts?${new URLSearchParams({ connectionId, stateOnly: id })}`,
              { cache: 'no-store' },
            );
            const state = (await readApiResponse(poll)) as {
              row?: { status?: BroadcastRow['status'] };
              message?: string;
            };
            if (!poll.ok)
              throw new Error(
                state.message ?? 'Could not check broadcast verification.',
              );
            nextStatus = state.row?.status ?? 'verifying';
            if (nextStatus !== 'verifying') break;
          }
          await load();
          if (nextStatus === 'sending' && !cancelRef.current) continue;
          if (nextStatus === 'paused_billing') {
            setNotice(
              'Meta billing error 131042. Queue paused; use Add Money / Fix Payment and then Resend & Continue.',
            );
          } else if (nextStatus === 'paused_error') {
            setNotice(
              'The test message failed. Review the cause, then use Resend & Continue.',
            );
          } else if (!cancelRef.current) {
            setNotice(
              'Waiting for Meta to deliver the first test message. No more messages were attempted. Refresh this page later and use Continue when it is verified.',
            );
          }
          break;
        }
        if (result.status === 'completed') {
          const latest = await load();
          const campaign = latest?.find((item) => item.id === id);
          setNotice(
            campaign?.stats.failed
              ? `Broadcast finished with ${campaign.stats.failed} failed recipient(s). Use Resend Failed to retry only confirmed failures.`
              : 'All messages submitted. Delivery and read ticks update from Meta.',
          );
          break;
        }
        if (result.noProgress) {
          setNotice(
            'No safely claimable recipients. An earlier message may still be in flight; do not resend until its status is confirmed.',
          );
          break;
        }
        // Avoid a heavy all-campaign read after every small batch.
        if (round % 5 === 0) await load();
      }
      if (cancelRef.current)
        setNotice(
          'Broadcast cancelled. Unsent contacts were preserved in history.',
        );
    } catch (error) {
      setNotice(friendlyError(error, 'Broadcast sending stopped.'));
    } finally {
      setSendingId('');
      void load().catch(() => undefined);
    }
  }

  async function resendBroadcast(id: string) {
    if (sendingId) return;
    setNotice('Preparing confirmed failed recipients for resend…');
    try {
      const response = await fetch('/api/whatsapp/broadcasts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resume', broadcastId: id }),
      });
      const data = (await readApiResponse(response)) as {
        retried?: number;
        message?: string;
      };
      if (!response.ok)
        throw new Error(data.message ?? 'Cannot resume broadcast.');
      await load();
      setNotice(
        `Retrying ${data.retried ?? 0} confirmed failed message(s), without resending accepted messages.`,
      );
      await runSending(id);
    } catch (error) {
      setNotice(friendlyError(error, 'Cannot resume broadcast.'));
    }
  }

  async function createBroadcast(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!template) return;
    setNotice('Creating broadcast…');
    try {
      const response = await fetch('/api/whatsapp/broadcasts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          connectionId,
          name:
            name.trim() ||
            `${template.name.replaceAll('_', ' ')} · ${new Date().toLocaleDateString('en-IN')}`,
          templateName: template.name,
          language: template.language,
          parameters: values.slice(0, needed),
          labelIds: audienceMode === 'labels' ? labelIds : [],
          contactIds: audienceMode === 'contacts' ? pickedIds : [],
          audienceMode,
          confirmOptIn: true,
        }),
      });
      const result = (await readApiResponse(response)) as {
        id?: string;
        total?: number;
        message?: string;
      };
      if (!response.ok || !result.id)
        throw new Error(result.message ?? 'Could not create broadcast.');
      setNotice(`Sending to ${result.total} contacts…`);
      setName('');
      await load();
      await runSending(result.id);
    } catch (error) {
      setNotice(friendlyError(error, 'Could not create broadcast.'));
    }
  }

  async function cancelBroadcast(id: string) {
    cancelRef.current = true;
    await fetch('/api/whatsapp/broadcasts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel', broadcastId: id }),
    });
    await load();
  }

  const who: 'everyone' | 'labels' | 'people' =
    audienceMode === 'contacts'
      ? 'people'
      : labelIds.length
        ? 'labels'
        : 'everyone';
  const filledPreview = bodyText.replace(/\{\{(\d+)\}\}/g, (_, n: string) => {
    const value = values[Number(n) - 1]?.trim();
    if (!value) return `[blank ${n}]`;
    return value.replace(/\{\{\s*name\s*\}\}/gi, 'Ravi');
  });
  const missingValues =
    values.slice(0, needed).filter((value) => value?.trim()).length < needed;
  const statusText: Record<string, string> = {
    verifying: 'Checking first message…',
    sending: 'Sending',
    paused_billing: 'Stopped: add money in Meta',
    paused_error: 'Stopped: please check',
    completed: 'Sent',
    cancelled: 'Cancelled',
  };

  return (
    <section className="wa-feature-page wa-bc">
      {rows.some((row) => row.status === 'paused_billing') && (
        <div className="wa-payment-alert" role="alert">
          <div>
            <strong>WhatsApp needs money to send your messages</strong>
            <p>
              Meta could not charge your card, so sending stopped. Nobody got a
              message twice. Add money or fix your card in Meta, then press
              “Send the rest”.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              className={primaryButton}
              href={metaBillingUrl(wabaId)}
              target="_blank"
              rel="noreferrer"
            >
              Add money in Meta ↗
            </a>
          </div>
        </div>
      )}

      {canManage && (
        <form onSubmit={createBroadcast} className="wa-bc-card">
          <h3 className="wa-bc-title">New broadcast</h3>
          <p className="wa-bc-sub">
            Send one message to many customers at once. Each person gets it
            privately, like a normal chat.
          </p>

          <div className="wa-bc-step">
            <span className="wa-bc-num">1</span>
            <div className="min-w-0 flex-1">
              <h4>Who should get it?</h4>
              <div className="wa-bc-options">
                <button
                  type="button"
                  className={who === 'everyone' ? 'wa-bc-option-on' : ''}
                  onClick={() => {
                    setAudienceMode('labels');
                    setLabelIds([]);
                  }}
                >
                  <strong>Everyone</strong>
                  <small>All customers who said yes to messages</small>
                </button>
                <button
                  type="button"
                  className={who === 'labels' ? 'wa-bc-option-on' : ''}
                  onClick={() => {
                    setAudienceMode('labels');
                    if (!labelIds.length && labelState.labels[0])
                      setLabelIds([labelState.labels[0].id]);
                  }}
                  disabled={!labelState.labels.length}
                  title={
                    labelState.labels.length
                      ? undefined
                      : 'Add a label to a chat first (🏷 in the chat)'
                  }
                >
                  <strong>A group (label)</strong>
                  <small>
                    {labelState.labels.length
                      ? 'For example “Hot leads”'
                      : 'No labels yet'}
                  </small>
                </button>
                <button
                  type="button"
                  className={who === 'people' ? 'wa-bc-option-on' : ''}
                  onClick={() => setAudienceMode('contacts')}
                >
                  <strong>Choose people</strong>
                  <small>Tick names one by one</small>
                </button>
              </div>

              {who === 'labels' && (
                <div className="wa-chips mt-2">
                  {labelState.labels.map((label) => {
                    const on = labelIds.includes(label.id);
                    return (
                      <button
                        key={label.id}
                        type="button"
                        className={on ? 'wa-chip-active' : ''}
                        onClick={() =>
                          setLabelIds((list) =>
                            on
                              ? list.filter((id) => id !== label.id)
                              : [...list, label.id],
                          )
                        }
                      >
                        {label.name} ({labelState.counts[label.id] ?? 0})
                      </button>
                    );
                  })}
                </div>
              )}

              {who === 'people' && (
                <div className="wa-bc-people">
                  <label className="wa-search">
                    <NavIcon kind="search" />
                    <input
                      placeholder="Search name or number"
                      value={contactRows.search}
                      onChange={(e) => contactRows.setSearch(e.target.value)}
                      aria-label="Search contacts"
                    />
                  </label>
                  <div className="wa-bc-people-list">
                    {contactRows.rows.map((row) => {
                      const blocked =
                        row.opted_out || !row.template_opted_in_at;
                      const on = pickedIds.includes(row.id);
                      return (
                        <label
                          key={row.id}
                          className={`wa-bc-person${blocked ? ' wa-bc-person-off' : ''}`}
                        >
                          <input
                            type="checkbox"
                            disabled={blocked}
                            checked={on}
                            onChange={() =>
                              setPickedIds((list) =>
                                on
                                  ? list.filter((id) => id !== row.id)
                                  : [...list, row.id],
                              )
                            }
                          />
                          <span
                            className="wa-avatar"
                            style={{ background: avatarColor(row.wa_id) }}
                          >
                            {(row.name || row.wa_id).slice(0, 1).toUpperCase()}
                          </span>
                          <span className="min-w-0 flex-1">
                            <strong>{row.name || `+${row.wa_id}`}</strong>
                            <small>
                              {row.opted_out
                                ? 'Said stop'
                                : !row.template_opted_in_at
                                  ? 'Has not said yes yet'
                                  : `+${row.wa_id}`}
                            </small>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <p className="wa-bc-count">
                {preview ? (
                  <>
                    <strong>{preview.eligible}</strong>{' '}
                    {preview.eligible === 1 ? 'person' : 'people'} will get it
                    {preview.noOptIn + preview.optedOut > 0 &&
                      ` · ${preview.noOptIn + preview.optedOut} left out (not said yes, or said stop)`}
                  </>
                ) : (
                  'Counting…'
                )}
              </p>
              <SheetImport
                connectionId={connectionId}
                onImported={(labelId) => {
                  void labelState.reload();
                  void contactRows.reload(true);
                  setAudienceMode('labels');
                  setLabelIds([labelId]);
                }}
              />
            </div>
          </div>

          <div className="wa-bc-step">
            <span className="wa-bc-num">2</span>
            <div className="min-w-0 flex-1">
              <h4>Which message?</h4>
              <p className="wa-bc-sub">
                Broadcasts use ready messages that WhatsApp has approved.
              </p>
              {!approved.length ? (
                <p className="wa-bc-empty">
                  No approved message yet.{' '}
                  <button
                    type="button"
                    className="font-semibold underline"
                    onClick={() => onNavigate('templates')}
                  >
                    Make one in Templates
                  </button>
                </p>
              ) : (
                <div className="wa-bc-templates">
                  {approved.map((item) => {
                    const key = `${item.name}|${item.language}`;
                    const text =
                      item.components?.find((c) => c.type === 'BODY')?.text ??
                      '';
                    return (
                      <button
                        key={key}
                        type="button"
                        className={templateKey === key ? 'wa-bc-option-on' : ''}
                        onClick={() => {
                          setTemplateKey(key);
                          setValues(['{{name}}']);
                        }}
                      >
                        <strong>{item.name.replaceAll('_', ' ')}</strong>
                        <small>{text}</small>
                      </button>
                    );
                  })}
                </div>
              )}
              {template && needed > 1 && (
                <div className="wa-bc-blanks">
                  <p className="wa-bc-sub">
                    Fill the blanks. Blank 1 is the customer’s name, added
                    automatically.
                  </p>
                  {Array.from({ length: needed - 1 }, (_, i) => i + 1).map(
                    (index) => (
                      <label key={index}>
                        Blank {index + 1}
                        <input
                          required
                          maxLength={1024}
                          value={values[index] ?? ''}
                          onChange={(e) =>
                            setValues((list) => {
                              const next = [...list];
                              next[0] = next[0] || '{{name}}';
                              next[index] = e.target.value;
                              return next;
                            })
                          }
                          placeholder={
                            index === 1 ? '2BHK interior' : 'Type here'
                          }
                        />
                      </label>
                    ),
                  )}
                </div>
              )}
              {template && (
                <div className="wa-bc-preview">
                  <span>How it will look</span>
                  <div className="wa-bc-bubble">{filledPreview}</div>
                </div>
              )}
            </div>
          </div>

          <div className="wa-bc-step">
            <span className="wa-bc-num">3</span>
            <div className="min-w-0 flex-1">
              <h4>Send</h4>
              <label className="wa-bc-name">
                Name (only you see this)
                <input
                  maxLength={120}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Diwali offer"
                />
              </label>
              <button
                className="wa-bc-send"
                disabled={
                  !template ||
                  !!sendingId ||
                  !preview?.eligible ||
                  missingValues ||
                  (audienceMode === 'contacts' && !pickedIds.length)
                }
              >
                {sendingId
                  ? 'Sending…'
                  : `Send to ${preview?.eligible ?? 0} ${preview?.eligible === 1 ? 'person' : 'people'}`}
              </button>
              <p className="wa-bc-sub">
                WhatsApp charges a small fee for each message.{' '}
                <a
                  className="font-semibold underline"
                  href={metaBillingUrl(wabaId)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Check money in Meta ↗
                </a>
              </p>
            </div>
          </div>
          {notice && (
            <p role="status" className="wa-bc-notice">
              {notice}
            </p>
          )}
        </form>
      )}

      <div className="space-y-3">
        <h3 className="wa-bc-title">Sent broadcasts</h3>
        {!rows.length && <p className="wa-bc-empty">Nothing sent yet.</p>}
        {rows.map((row) => {
          const done = row.stats.sent + row.stats.delivered + row.stats.read;
          return (
            <article key={row.id} className="wa-bc-row">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <strong className="block truncate">{row.name}</strong>
                  <small>
                    {readableDate(row.created_at)} · {row.total}{' '}
                    {row.total === 1 ? 'person' : 'people'}
                  </small>
                </div>
                <span className={`wa-bc-status wa-bc-status-${row.status}`}>
                  {sendingId === row.id
                    ? 'Sending now…'
                    : (statusText[row.status] ?? row.status)}
                </span>
              </div>
              <div className="wa-bc-stats">
                <span>✓ Sent {done}</span>
                <span>✓✓ Got it {row.stats.delivered + row.stats.read}</span>
                <span className="text-sky-600">✓✓ Read {row.stats.read}</span>
                {row.stats.failed > 0 && (
                  <span className="text-red-700">
                    ✕ Failed {row.stats.failed}
                  </span>
                )}
                {row.stats.queued > 0 && (
                  <span>⏳ Waiting {row.stats.queued}</span>
                )}
              </div>
              {Object.entries(row.errors ?? {}).map(([code, count]) => {
                const help = whatsappErrorHelp(code, wabaId);
                if (!help) return null;
                return (
                  <p key={code} className="wa-failure-reason">
                    <strong>
                      {count} not sent: {help.reason}.
                    </strong>{' '}
                    {help.action}
                    {help.link && (
                      <>
                        {' '}
                        <a
                          href={help.link.href}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {help.link.label} ↗
                        </a>
                      </>
                    )}
                  </p>
                );
              })}
              {canManage && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {row.status === 'sending' && sendingId !== row.id && (
                    <button
                      type="button"
                      className="wa-row-action"
                      disabled={!!sendingId}
                      onClick={() => void runSending(row.id)}
                    >
                      Continue sending
                    </button>
                  )}
                  {(row.status === 'paused_billing' ||
                    row.status === 'paused_error' ||
                    (row.status === 'completed' && row.stats.failed > 0)) && (
                    <button
                      type="button"
                      className="wa-row-action"
                      disabled={!!sendingId}
                      onClick={() => void resendBroadcast(row.id)}
                    >
                      {row.status === 'completed'
                        ? 'Try failed ones again'
                        : 'Send the rest'}
                    </button>
                  )}
                  {[
                    'sending',
                    'verifying',
                    'paused_billing',
                    'paused_error',
                  ].includes(row.status) && (
                    <button
                      type="button"
                      className="wa-row-action wa-row-action-danger"
                      onClick={() => void cancelBroadcast(row.id)}
                    >
                      Stop
                    </button>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function SheetImport({
  connectionId,
  onImported,
}: {
  connectionId: string;
  onImported: (labelId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Array<{ phone: string; name: string }>>([]);
  const [invalid, setInvalid] = useState(0);
  const [labelName, setLabelName] = useState(
    () =>
      `Upload ${new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(new Date())}`,
  );
  const [source, setSource] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  async function readFile(file: File) {
    if (!/\.(csv|txt)$/i.test(file.name)) {
      setNotice(
        'Save the sheet as CSV first: Excel → File → Save As → CSV, or Google Sheets → File → Download → CSV.',
      );
      return;
    }
    const parsed = parseContactSheet(await file.text());
    setRows(parsed.contacts.slice(0, 2000));
    setInvalid(parsed.invalid.length);
    setNotice(
      `${parsed.contacts.length} numbers found${parsed.invalid.length ? `, ${parsed.invalid.length} rows skipped (no valid number)` : ''}.`,
    );
  }

  async function upload() {
    setBusy(true);
    try {
      const response = await fetch('/api/whatsapp/broadcasts/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId,
          consentSource: source,
          labelName,
          rows,
        }),
      });
      const result = (await readApiResponse(response)) as {
        imported?: number;
        skippedOptedOut?: number;
        failed?: number;
        labelId?: string;
        message?: string;
      };
      if (!response.ok || !result.labelId)
        throw new Error(result.message ?? 'Upload failed.');
      setNotice(
        `${result.imported} contacts added with label “${labelName}” and selected as the audience.${result.skippedOptedOut ? ` ${result.skippedOptedOut} skipped because they opted out.` : ''}${result.failed ? ` ${result.failed} could not be saved.` : ''}`,
      );
      setRows([]);
      setAgree(false);
      onImported(result.labelId);
    } catch (error) {
      setNotice(friendlyError(error, 'Upload failed.'));
    } finally {
      setBusy(false);
    }
  }

  if (!open)
    return (
      <button
        type="button"
        className={softButton}
        onClick={() => setOpen(true)}
      >
        ⬆ Upload contacts from a sheet (CSV)
      </button>
    );
  return (
    <div className="space-y-3 rounded-xl border border-dashed border-stone-300 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs leading-5 text-stone-600">
          Columns: <strong>phone</strong> (required) and <strong>name</strong>.
          10-digit Indian mobiles get +91 automatically. Up to 2000 rows.
        </p>
        <button
          type="button"
          className="text-xs text-stone-500"
          onClick={() => setOpen(false)}
        >
          Close
        </button>
      </div>
      <input
        type="file"
        accept=".csv,text/csv,.txt"
        className="text-xs"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void readFile(file);
          event.currentTarget.value = '';
        }}
      />
      {rows.length > 0 && (
        <>
          <div className="max-h-32 overflow-auto rounded-lg bg-white p-2 text-xs text-stone-600">
            {rows.slice(0, 8).map((row) => (
              <p key={row.phone}>
                +{row.phone} {row.name && `· ${row.name}`}
              </p>
            ))}
            {rows.length > 8 && <p>… and {rows.length - 8} more</p>}
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <label className="block space-y-1 text-xs font-semibold text-stone-600">
              Label for these contacts
              <input
                className={field}
                maxLength={40}
                value={labelName}
                onChange={(e) => setLabelName(e.target.value)}
              />
            </label>
            <label className="block space-y-1 text-xs font-semibold text-stone-600">
              Where did they agree to WhatsApp messages?
              <input
                className={field}
                maxLength={200}
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="Website enquiry form / site visit form"
              />
            </label>
          </div>
          <label className="flex items-start gap-2 text-xs text-stone-700">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
            />
            Everyone on this sheet agreed to receive WhatsApp messages from us.
            People who previously replied STOP are skipped automatically.
          </label>
          <button
            type="button"
            className={primaryButton}
            disabled={
              busy || !agree || source.trim().length < 3 || !labelName.trim()
            }
            onClick={() => void upload()}
          >
            {busy ? 'Adding contacts…' : `Add ${rows.length} contacts`}
          </button>
        </>
      )}
      {(notice || invalid > 0) && (
        <p role="status" className="text-xs text-stone-700">
          {notice}
        </p>
      )}
    </div>
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
            <small>
              {connection.status === 'connected'
                ? 'Connected'
                : connection.status}
            </small>
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
  canManage,
  onAddContact,
  onEditContact,
}: {
  connectionId: string;
  refreshKey: number;
  canManage: boolean;
  onAddContact: () => void;
  onEditContact: (contact: Contact, resume?: boolean) => void;
}) {
  const state = useWorkspaceRows('contacts', connectionId, refreshKey);
  const [busyId, setBusyId] = useState('');
  async function optOut(contact: Contact) {
    setBusyId(contact.id);
    try {
      await fetch('/api/whatsapp/inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'opt_out',
          connectionId,
          waId: contact.wa_id,
        }),
      });
      await state.reload(true);
    } finally {
      setBusyId('');
    }
  }
  return (
    <div>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h3 className="text-lg font-bold text-stone-900">
            WhatsApp contacts
          </h3>
          <p className="mt-1 text-sm text-stone-500">
            Customers who message you appear here automatically. Contacts with
            “Opted in” can receive broadcasts; use Opt out if someone asks to
            stop.
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
        <div className="grid grid-cols-[minmax(140px,1.1fr)_minmax(120px,.8fr)_minmax(150px,1.3fr)_100px_150px] gap-3 bg-stone-50 px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-stone-500">
          <span>Name</span>
          <span>WhatsApp number</span>
          <span>Latest message</span>
          <span>Consent</span>
          <span>Actions</span>
        </div>
        {state.rows.map((row) => (
          <div
            key={row.id}
            className="grid grid-cols-[minmax(140px,1.1fr)_minmax(120px,.8fr)_minmax(150px,1.3fr)_100px_150px] items-center gap-3 border-t border-stone-100 px-4 py-3 text-sm"
          >
            <div className="truncate font-semibold text-stone-900">
              {row.name || 'Unknown contact'}
            </div>
            <div className="text-stone-600">+{row.wa_id}</div>
            <div className="truncate text-stone-500">
              {whatsappMessagePreview(row.last_message) || '—'}
            </div>
            <div>
              <span
                className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${row.opted_out ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}
              >
                {row.opted_out
                  ? 'Opted out'
                  : row.template_opted_in_at
                    ? 'Opted in'
                    : 'Not opted in'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {canManage && (
                <>
                  <button
                    type="button"
                    className="wa-row-action"
                    onClick={() => onEditContact(row)}
                  >
                    Edit
                  </button>
                  {row.opted_out ? (
                    <button
                      type="button"
                      className="wa-row-action"
                      title="Only if the customer asked to receive messages again"
                      onClick={() => onEditContact(row, true)}
                    >
                      Resume
                    </button>
                  ) : row.template_opted_in_at ? (
                    <button
                      type="button"
                      className="wa-row-action wa-row-action-danger"
                      disabled={busyId === row.id}
                      onClick={() => void optOut(row)}
                    >
                      {busyId === row.id ? '…' : 'Opt out'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="wa-row-action"
                      onClick={() => onEditContact(row)}
                    >
                      Opt in
                    </button>
                  )}
                </>
              )}
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
  const [triggerType, setTriggerType] = useState<TriggerType>('greeting');
  const [schedule, setSchedule] = useState<Schedule>(DEFAULT_SCHEDULE);
  const [menu, setMenu] = useState<MenuOption[]>(DEFAULT_MENU);
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
          keyword: triggerType === 'keyword' ? keyword : '',
          replyText,
          status: 'paused',
          ...(triggerType === 'away' ? { schedule } : {}),
          ...(triggerType === 'menu' ? { menu } : {}),
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
          ...(rule.trigger_type === 'away'
            ? { schedule: { ...DEFAULT_SCHEDULE, ...(rule.schedule ?? {}) } }
            : {}),
          ...(rule.trigger_type === 'menu' ? { menu: rule.menu ?? [] } : {}),
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
              Like WhatsApp Business: a greeting for new customers, an away
              message outside business hours, and keyword replies. One automatic
              reply is sent per customer message.
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
                    {triggerLabel(rule)}
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
              {rule.trigger_type === 'menu' && (
                <ol className="mt-2 space-y-1 text-xs text-stone-600">
                  {(rule.menu ?? []).map((option) => (
                    <li key={option.key}>
                      <strong>
                        {option.key}. {option.title}
                      </strong>{' '}
                      → {option.reply}
                    </li>
                  ))}
                </ol>
              )}
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
              <option value="menu">
                Auto-reply menu (1 for Accounts, 2 for Sales…)
              </option>
              <option value="greeting">
                Greeting message (first message or after 14 days)
              </option>
              <option value="away">
                Away message (outside business hours)
              </option>
              <option value="keyword">Message contains a keyword</option>
              <option value="any_message">
                Any message (once per customer per 24 h)
              </option>
            </select>
          </label>
          {triggerType === 'menu' && (
            <fieldset className="space-y-2 rounded-xl border border-stone-200 p-3">
              <legend className="px-1 text-xs font-semibold text-stone-600">
                Menu options (customer replies with the number)
              </legend>
              {menu.map((option, index) => (
                <div
                  key={index}
                  className="grid grid-cols-[44px_1fr_auto] items-start gap-2"
                >
                  <input
                    className={field}
                    aria-label="Option number"
                    maxLength={2}
                    pattern="[0-9]{1,2}"
                    required
                    value={option.key}
                    onChange={(e) =>
                      setMenu((list) =>
                        list.map((item, i) =>
                          i === index
                            ? {
                                ...item,
                                key: e.target.value.replace(/\D/g, ''),
                              }
                            : item,
                        ),
                      )
                    }
                  />
                  <div className="space-y-1">
                    <input
                      className={field}
                      aria-label="Option title"
                      maxLength={24}
                      required
                      placeholder="Accounts"
                      value={option.title}
                      onChange={(e) =>
                        setMenu((list) =>
                          list.map((item, i) =>
                            i === index
                              ? { ...item, title: e.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                    <textarea
                      className={field}
                      aria-label="Reply for this option"
                      rows={2}
                      maxLength={1000}
                      required
                      placeholder="Reply sent when the customer chooses this"
                      value={option.reply}
                      onChange={(e) =>
                        setMenu((list) =>
                          list.map((item, i) =>
                            i === index
                              ? { ...item, reply: e.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                  </div>
                  <button
                    type="button"
                    className="pt-2 text-xs font-semibold text-stone-500 hover:text-red-700"
                    disabled={menu.length <= 1}
                    onClick={() =>
                      setMenu((list) => list.filter((_, i) => i !== index))
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
              {menu.length < 10 && (
                <button
                  type="button"
                  className={softButton}
                  onClick={() =>
                    setMenu((list) => [
                      ...list,
                      { key: String(list.length + 1), title: '', reply: '' },
                    ])
                  }
                >
                  + Add option
                </button>
              )}
              <p className="text-[11px] text-stone-500">
                Customers get your message with these numbered options and a
                tappable list. Typing the number (or tapping) within 24 hours
                sends that option&apos;s reply. MENU or 0 shows it again.
              </p>
            </fieldset>
          )}
          {triggerType === 'away' && (
            <fieldset className="space-y-2 rounded-xl border border-stone-200 p-3">
              <legend className="px-1 text-xs font-semibold text-stone-600">
                Business hours (India time)
              </legend>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((day, index) => {
                  const on = schedule.days.includes(index);
                  return (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={on}
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${on ? 'bg-[#88352B] text-white' : 'bg-stone-100 text-stone-600'}`}
                      onClick={() =>
                        setSchedule((value) => ({
                          ...value,
                          days: on
                            ? value.days.filter((d) => d !== index)
                            : [...value.days, index].sort(),
                        }))
                      }
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block space-y-1 text-xs font-semibold text-stone-600">
                  Opens
                  <input
                    type="time"
                    className={field}
                    required
                    value={schedule.start}
                    onChange={(e) =>
                      setSchedule((value) => ({
                        ...value,
                        start: e.target.value,
                      }))
                    }
                  />
                </label>
                <label className="block space-y-1 text-xs font-semibold text-stone-600">
                  Closes
                  <input
                    type="time"
                    className={field}
                    required
                    value={schedule.end}
                    onChange={(e) =>
                      setSchedule((value) => ({
                        ...value,
                        end: e.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              <p className="text-[11px] text-stone-500">
                The away message is sent once per customer every 12 hours when
                they write outside these hours.
              </p>
            </fieldset>
          )}
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
          <button
            className={primaryButton}
            disabled={
              busy ||
              (triggerType === 'away' && schedule.days.length === 0) ||
              (triggerType === 'menu' &&
                new Set(menu.map((option) => option.key)).size !== menu.length)
            }
          >
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
      <QuickRepliesManager canManage={canManage} />
    </div>
  );
}

function useQuickReplies() {
  const [replies, setReplies] = useState<QuickReply[]>([]);
  const reload = useCallback(async () => {
    const response = await fetch('/api/whatsapp/quick-replies', {
      cache: 'no-store',
    });
    const data = (await readApiResponse(response)) as {
      rows?: QuickReply[];
    };
    if (response.ok) setReplies(data.rows ?? []);
  }, []);
  useEffect(() => {
    void reload().catch(() => undefined);
  }, [reload]);
  return { replies, reload };
}

function QuickRepliesManager({ canManage }: { canManage: boolean }) {
  const { replies, reload } = useQuickReplies();
  const [shortcut, setShortcut] = useState('');
  const [text, setText] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch('/api/whatsapp/quick-replies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shortcut, body: text }),
      });
      const result = (await readApiResponse(response)) as { message?: string };
      if (!response.ok)
        throw new Error(result.message ?? 'Could not save quick reply.');
      setShortcut('');
      setText('');
      setNotice('Quick reply saved. Type / in a chat to use it.');
      await reload();
    } catch (error) {
      setNotice(friendlyError(error, 'Could not save quick reply.'));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await fetch('/api/whatsapp/quick-replies', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      await reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-stone-200 p-5 xl:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-stone-900">Quick replies</h3>
          <p className="mt-1 text-sm text-stone-500">
            Saved answers for common questions. In any chat, type <code>/</code>{' '}
            and the shortcut to insert one. Use <code>{'{{name}}'}</code> for
            the customer&apos;s name.
          </p>
        </div>
        <span className="rounded-full bg-[#f9eee9] px-3 py-1 text-xs font-semibold text-[#88352B]">
          {replies.length} saved
        </span>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {replies.map((reply) => (
          <article
            key={reply.id}
            className="flex items-start justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50/70 p-3"
          >
            <div className="min-w-0">
              <p className="font-mono text-xs font-semibold text-[#88352B]">
                /{reply.shortcut}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-stone-700">
                {reply.body}
              </p>
            </div>
            {canManage && (
              <button
                type="button"
                className="text-xs font-semibold text-stone-500 hover:text-red-700"
                disabled={busy}
                onClick={() => void remove(reply.id)}
              >
                Delete
              </button>
            )}
          </article>
        ))}
      </div>
      {canManage && (
        <form
          onSubmit={save}
          className="mt-4 grid gap-2 md:grid-cols-[180px_1fr_auto]"
        >
          <input
            className={field}
            required
            maxLength={30}
            pattern="[a-zA-Z0-9][a-zA-Z0-9_-]{0,29}"
            value={shortcut}
            onChange={(e) => setShortcut(e.target.value.replace(/^\//, ''))}
            placeholder="shortcut e.g. price"
            aria-label="Quick reply shortcut"
          />
          <input
            className={field}
            required
            maxLength={1000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Hi {{name}}, our 2BHK interiors start from ₹4.5 lakh…"
            aria-label="Quick reply text"
          />
          <button className={primaryButton} disabled={busy}>
            Save
          </button>
        </form>
      )}
      {notice && (
        <p role="status" className="mt-3 text-sm text-stone-600">
          {notice}
        </p>
      )}
    </section>
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
  const [view, setView] = useState<'mine' | 'new'>('mine');
  const [sendKey, setSendKey] = useState('');
  const [sendTo, setSendTo] = useState('');
  const [sendValues, setSendValues] = useState<string[]>([]);
  const [newName, setNewName] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newCategory, setNewCategory] = useState('UTILITY');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const contactRows = useWorkspaceRows('contacts', connectionId);
  const optedIn = contactRows.rows.filter(
    (row) => !row.opted_out && row.template_opted_in_at,
  );

  const statusOf = (item: Template) => {
    const status = item.status.toUpperCase();
    if (['APPROVED', 'ACTIVE'].includes(status))
      return { text: '✅ Ready to use', className: 'wa-tpl-ok', ready: true };
    if (['PENDING', 'IN_REVIEW'].includes(status))
      return {
        text: '⏳ Waiting for WhatsApp',
        className: 'wa-tpl-wait',
        ready: false,
      };
    if (status === 'REJECTED')
      return { text: '❌ Not approved', className: 'wa-tpl-no', ready: false };
    return {
      text: status.replaceAll('_', ' ').toLowerCase(),
      className: 'wa-tpl-wait',
      ready: false,
    };
  };
  const bodyOf = (item: Template) =>
    item.components?.find((component) => component.type === 'BODY')?.text ?? '';
  const blanksOf = (text: string) =>
    Math.max(
      0,
      ...[...text.matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1])),
    );

  async function refreshStatus() {
    setRefreshing(true);
    try {
      await loadTemplates();
      setNotice('Status updated.');
    } catch (error) {
      setNotice(friendlyError(error, 'Could not check status right now.'));
    } finally {
      setRefreshing(false);
    }
  }

  async function sendOne(item: Template) {
    const person = optedIn.find((row) => row.id === sendTo);
    if (!person) return;
    setBusy(true);
    try {
      const blanks = blanksOf(bodyOf(item));
      const values = Array.from({ length: blanks }, (_, i) =>
        (sendValues[i] ?? '')
          .replace(/\{\{\s*name\s*\}\}/gi, person.name || 'there')
          .trim(),
      );
      const response = await fetch('/api/whatsapp/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageType: 'template',
          connectionId,
          to: `+${person.wa_id}`,
          templateName: item.name,
          language: item.language,
          parameters: values,
          recipientHasOptedIn: true,
        }),
      });
      const data = (await readApiResponse(response)) as { message?: string };
      if (!response.ok)
        throw new Error(data.message ?? 'Message could not be sent.');
      setNotice(`Sent to ${person.name || `+${person.wa_id}`}.`);
      setSendKey('');
    } catch (error) {
      setNotice(friendlyError(error, 'Message could not be sent.'));
    } finally {
      setBusy(false);
    }
  }

  async function submitTemplate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch('/api/whatsapp/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId,
          name: newName
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_|_$/g, ''),
          category: newCategory,
          language: 'en_US',
          body: newBody,
        }),
      });
      const data = (await readApiResponse(response)) as { message?: string };
      if (!response.ok)
        throw new Error(data.message ?? 'Could not send for approval.');
      setNotice(
        'Sent to WhatsApp for approval. It usually takes a few minutes to a day.',
      );
      setNewName('');
      setNewBody('');
      setView('mine');
      await loadTemplates().catch(() => undefined);
    } catch (error) {
      setNotice(friendlyError(error, 'Could not send for approval.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wa-tpl">
      <div className="wa-tpl-intro">
        <p>
          A <strong>template</strong> is a ready message that WhatsApp checks
          and approves. You need one to message a customer who has not written
          to you in the last 24 hours, and for broadcasts.
        </p>
      </div>

      <div className="wa-chips" role="tablist">
        <button
          type="button"
          className={view === 'mine' ? 'wa-chip-active' : ''}
          onClick={() => setView('mine')}
        >
          My templates ({templates.length})
        </button>
        {canManage && (
          <button
            type="button"
            className={view === 'new' ? 'wa-chip-active' : ''}
            onClick={() => setView('new')}
          >
            + Make a new one
          </button>
        )}
      </div>

      {notice && (
        <p role="status" className="wa-bc-notice">
          {notice}
        </p>
      )}

      {view === 'mine' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button
              type="button"
              className="wa-row-action"
              onClick={() => void refreshStatus()}
              disabled={refreshing}
            >
              {refreshing ? 'Checking…' : '↻ Check status'}
            </button>
          </div>
          {!templates.length && (
            <p className="wa-bc-empty">
              No templates yet. Press “+ Make a new one”.
            </p>
          )}
          {[...templates]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((item) => {
              const status = statusOf(item);
              const key = `${item.name}|${item.language}`;
              const text = bodyOf(item);
              const blanks = blanksOf(text);
              const open = sendKey === key;
              return (
                <article key={item.id} className="wa-tpl-card">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <strong className="block">
                        {item.name.replaceAll('_', ' ')}
                      </strong>
                      <small>
                        {(item.category ?? '').toUpperCase() === 'MARKETING'
                          ? 'Offers & promotions'
                          : 'Updates & reminders'}
                      </small>
                    </div>
                    <span className={`wa-tpl-status ${status.className}`}>
                      {status.text}
                    </span>
                  </div>
                  <div className="wa-bc-bubble mt-2">{text || '—'}</div>
                  {status.ready && canManage && !open && (
                    <button
                      type="button"
                      className="wa-bc-send mt-3"
                      onClick={() => {
                        setSendKey(key);
                        setSendTo('');
                        setSendValues(['{{name}}']);
                      }}
                    >
                      Send to one person
                    </button>
                  )}
                  {open && (
                    <div className="wa-tpl-send">
                      <label>
                        Send to
                        <select
                          value={sendTo}
                          onChange={(e) => setSendTo(e.target.value)}
                        >
                          <option value="">Choose a customer</option>
                          {optedIn.map((row) => (
                            <option key={row.id} value={row.id}>
                              {row.name || `+${row.wa_id}`} · +{row.wa_id}
                            </option>
                          ))}
                        </select>
                      </label>
                      {Array.from(
                        { length: Math.max(0, blanks - 1) },
                        (_, i) => i + 1,
                      ).map((index) => (
                        <label key={index}>
                          Blank {index + 1}
                          <input
                            value={sendValues[index] ?? ''}
                            onChange={(e) =>
                              setSendValues((list) => {
                                const next = [...list];
                                next[index] = e.target.value;
                                return next;
                              })
                            }
                            placeholder="Type here"
                          />
                        </label>
                      ))}
                      {blanks > 0 && (
                        <p className="wa-bc-sub">
                          Blank 1 is filled with the customer’s name.
                        </p>
                      )}
                      {!optedIn.length && (
                        <p className="wa-bc-sub">
                          No customer has said yes to messages yet. Open
                          Contacts and press “Opt in”.
                        </p>
                      )}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="wa-bc-send"
                          disabled={
                            busy ||
                            !sendTo ||
                            Array.from(
                              { length: Math.max(0, blanks - 1) },
                              (_, i) => i + 1,
                            ).some((i) => !(sendValues[i] ?? '').trim())
                          }
                          onClick={() => void sendOne(item)}
                        >
                          {busy ? 'Sending…' : 'Send'}
                        </button>
                        <button
                          type="button"
                          className="wa-row-action"
                          onClick={() => setSendKey('')}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
        </div>
      )}

      {view === 'new' && canManage && (
        <div className="space-y-4">
          <div>
            <h4 className="wa-bc-title">Start from an example</h4>
            <div className="wa-tpl-starters">
              {starterTemplates.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  onClick={() => {
                    setNewName(item.title);
                    setNewBody(item.body);
                    setNewCategory(item.category);
                  }}
                >
                  <strong>{item.title}</strong>
                  <small>{item.body}</small>
                </button>
              ))}
            </div>
          </div>
          <form onSubmit={submitTemplate} className="wa-bc-card">
            <label className="wa-bc-name">
              Name
              <input
                required
                maxLength={60}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Site visit reminder"
              />
            </label>
            <label className="wa-bc-name">
              Type
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
              >
                <option value="UTILITY">Updates &amp; reminders</option>
                <option value="MARKETING">Offers &amp; promotions</option>
              </select>
            </label>
            <label className="wa-bc-name">
              Message
              <textarea
                required
                rows={4}
                maxLength={1024}
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                placeholder="Hi {{1}}, your site visit is on {{2}}."
              />
            </label>
            <p className="wa-bc-sub">
              Write <code>{'{{1}}'}</code> where the customer’s name goes, and{' '}
              <code>{'{{2}}'}</code>, <code>{'{{3}}'}</code> for other blanks.
            </p>
            <button className="wa-bc-send" disabled={busy}>
              {busy ? 'Sending…' : 'Send to WhatsApp for approval'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
