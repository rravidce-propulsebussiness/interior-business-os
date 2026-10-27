'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { signOut } from '@business-os/auth/actions';
import { ClientDesignReview } from './client-design-review';
import { ClientPaymentProofForm } from './client-payment-proof-form';
import { ClientProjectTimeline } from './project-timeline';
import {
  ClientProjectRequests,
  type ProjectClientRequest,
} from '../project-request-widgets';

export type ClientStage = {
  id: string;
  title: string;
  description: string;
  phase: string;
  floor_code: string | null;
  status: string;
  completed_at: string | null;
  activities: string[];
};
export type ClientReport = {
  report_date: string;
  completed_work: string;
  tomorrow_plan: string;
  worker_count: number | null;
  tomorrow_workers?: number | null | undefined;
  checks_done?: string | null | undefined;
  checks_required?: string | null | undefined;
  created_at: string;
};
export type ClientDrawing = {
  kind: string;
  revision: number;
  reference: string;
  status: string;
  created_at: string;
};
export type ClientPhoto = {
  id: string;
  filename: string;
  caption: string;
  mime: string;
  category: string;
  created_at: string;
};
export type ClientMaterial = {
  description: string;
  unit: string | null;
  ordered_quantity: string | null;
  po_number: string | null;
  expected_date: string | null;
  expected_window?: string | null | undefined;
  status: string;
  received_date: string | null;
  sort_time: string | null;
};
export type ClientCheck = {
  name: string;
  status: string;
  due_date: string | null;
  completed_at: string | null;
  sort_time: string;
  source: string;
};
export type ClientUpdate = {
  category: string;
  summary: string;
  created_at: string;
};
export type ClientPaymentProof = {
  id: string;
  requestId: string;
  amount: number;
  reference: string;
  status: 'pending' | 'approved' | 'rejected' | 'reversed';
  date: string;
  reviewNote: string;
  receiptId: string | null;
};
export type ClientStagePaymentRequest = {
  id: string;
  number: string;
  label: string;
  total: number;
  date: string;
  dueDate: string | null;
  paymentStatus: 'payment_requested';
  contractNumber: string;
};
export type ClientInvoice = {
  id: string;
  number: string;
  documentType: string;
  date: string;
  dueDate: string | null;
  total: number;
  paymentStatus: 'payment_requested';
};
export type ClientDashboardData = {
  project: {
    id: string;
    name: string;
    code: string;
    company_name: string;
    stage: string;
    client_approved_at?: string | null | undefined;
    reports: ClientReport[];
    drawings: ClientDrawing[];
    photos: ClientPhoto[];
  };
  timeline: ClientStage[];
  timelineUnavailable: boolean;
  metrics: {
    materials: ClientMaterial[];
    checks: ClientCheck[];
    latest_report: ClientReport | null;
    updates: ClientUpdate[];
    local_date: string;
  };
  metricsUnavailable: boolean;
  requests: ProjectClientRequest[];
  invoices: ClientInvoice[];
  paymentRequests: ClientStagePaymentRequest[];
  paymentProofs: ClientPaymentProof[];
  clientEmail: string;
};

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const attrs = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true as const,
  };
  switch (name) {
    case 'home':
      return (
        <svg {...attrs}>
          <path d="m3 10 9-7 9 7v10H3Z" />
          <path d="M9 20v-7h6v7" />
        </svg>
      );
    case 'progress':
      return (
        <svg {...attrs}>
          <path d="M4 19V5m0 14h16" />
          <path d="M8 15v-4m4 4V7m4 8V5" />
        </svg>
      );
    case 'calendar':
      return (
        <svg {...attrs}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M7 3v4m10-4v4M3 10h18" />
        </svg>
      );
    case 'truck':
      return (
        <svg {...attrs}>
          <path d="M3 6h11v11H3Zm11 4h4l3 4v3h-7Z" />
          <circle cx="7" cy="18" r="2" />
          <circle cx="18" cy="18" r="2" />
        </svg>
      );
    case 'shield':
      return (
        <svg {...attrs}>
          <path d="m12 2 8 4v6c0 5-3 8-8 10-5-2-8-5-8-10V6Z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    case 'camera':
      return (
        <svg {...attrs}>
          <rect x="3" y="6" width="18" height="14" rx="2" />
          <circle cx="12" cy="13" r="3" />
          <path d="m8 6 1-3h6l1 3" />
        </svg>
      );
    case 'file':
      return (
        <svg {...attrs}>
          <path d="M6 3h8l5 5v13H6Z" />
          <path d="M14 3v6h5M9 14h7m-7 4h7" />
        </svg>
      );
    case 'users':
      return (
        <svg {...attrs}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3 20v-3a6 6 0 0 1 12 0v3M17 5a3 3 0 0 1 0 6m1 3a5 5 0 0 1 3 5" />
        </svg>
      );
    case 'check':
      return (
        <svg {...attrs}>
          <path d="m4 12 5 5L20 6" />
        </svg>
      );
    case 'clock':
      return (
        <svg {...attrs}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l4 3" />
        </svg>
      );
    case 'chat':
      return (
        <svg {...attrs}>
          <path d="M20 16a3 3 0 0 1-3 3H8l-5 3V6a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3Z" />
          <path d="M7 9h9m-9 4h6" />
        </svg>
      );
    case 'layers':
      return (
        <svg {...attrs}>
          <path d="m12 2 10 6-10 6L2 8Zm-10 11 10 6 10-6M2 17l10 5 10-5" />
        </svg>
      );
    case 'arrow':
      return (
        <svg {...attrs}>
          <path d="M4 12h16m-7-7 7 7-7 7" />
        </svg>
      );
    case 'search':
      return (
        <svg {...attrs}>
          <circle cx="10" cy="10" r="7" />
          <path d="m15 15 6 6" />
        </svg>
      );
    default:
      return (
        <svg {...attrs}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v5m0 3h.01" />
        </svg>
      );
  }
}

const doneStates = new Set(['completed', 'certified', 'done']);
const positiveStates = new Set([
  'passed',
  'approved',
  'completed',
  'done',
  'cleared',
]);
const currentStates = new Set([
  'active',
  'in_progress',
  'started',
  'blocked',
  'under_review',
]);

function fmt(value?: string | null, opts?: Intl.DateTimeFormatOptions) {
  if (!value) return 'Not scheduled';
  const date = new Date(value.length === 10 ? value + 'T12:00:00Z' : value);
  if (Number.isNaN(date.getTime())) return 'Not scheduled';
  return date.toLocaleDateString(
    'en-IN',
    opts ?? {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    },
  );
}
function pretty(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function advanceDate(value: string | null, offset: number) {
  if (!value) return null;
  const d = new Date(value + 'T12:00:00Z');
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}
function deliveryExpectation(material: ClientMaterial, localDate: string) {
  if (material.status === 'delivered' || material.status === 'received')
    return 'Received at site';
  if (!material.expected_date)
    return material.status === 'ordered'
      ? 'Expected delivery not yet confirmed'
      : 'Not ordered yet';
  const today = localDate;
  const tomorrow = advanceDate(today, 1);
  const label =
    material.expected_date === today
      ? 'Today'
      : material.expected_date === tomorrow
        ? 'Tomorrow'
        : fmt(material.expected_date);
  const window =
    material.expected_window && material.expected_window !== 'anytime'
      ? ' · ' + pretty(material.expected_window)
      : '';
  return label + window;
}
function statusTone(status: string) {
  if (positiveStates.has(status) || status === 'delivered') return 'good';
  if (
    status === 'partially_delivered' ||
    status === 'in_progress' ||
    status === 'under_review'
  )
    return 'review';
  if (
    status === 'overdue' ||
    status === 'failed' ||
    status === 'rejected' ||
    status === 'blocked'
  )
    return 'danger';
  return 'neutral';
}
function short(text: string, n = 170) {
  return text.length > n ? text.slice(0, n).trimEnd() + '…' : text;
}
function cardHeader(title: string, href: string, subtitle?: string) {
  return (
    <div className="pc-section-head">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <a className="pc-view-link" href={href}>
        View all <Icon name="arrow" size={14} />
      </a>
    </div>
  );
}

export function ClientDashboard({
  project,
  timeline,
  timelineUnavailable,
  metrics,
  metricsUnavailable,
  requests,
  invoices,
  paymentRequests,
  paymentProofs,
  clientEmail,
}: ClientDashboardData) {
  const [search, setSearch] = useState('');
  const needle = search.toLocaleLowerCase().trim();
  const filtered = <T extends object>(items: T[]) =>
    needle
      ? items.filter((item) =>
          JSON.stringify(item).toLocaleLowerCase().includes(needle),
        )
      : items;
  const stageDone = timeline.filter((s) => doneStates.has(s.status)).length;
  const progress = timeline.length
    ? Math.round((100 * stageDone) / timeline.length)
    : null;
  const current =
    timeline.find((s) => currentStates.has(s.status)) ??
    timeline.find((s) => !doneStates.has(s.status));
  const images = project.photos.filter((photo) =>
    photo.mime.startsWith('image/'),
  );
  const pdfs = project.photos.filter(
    (photo) => photo.mime === 'application/pdf',
  );
  const drawings = useMemo(() => {
    const seen = new Set<string>();
    return project.drawings.filter((d) => {
      if (seen.has(d.kind)) return false;
      seen.add(d.kind);
      return true;
    });
  }, [project.drawings]);
  const recent = filtered(metrics.updates);
  const materials = filtered(metrics.materials);
  const checks = filtered(metrics.checks);
  const report = metrics.latest_report ?? project.reports[0] ?? null;
  const reportIsToday = report?.report_date === metrics.local_date;
  const delivered = metrics.materials.filter(
    (m) => m.status === 'delivered',
  ).length;
  const pendingChecks = metrics.checks.filter(
    (check) => !positiveStates.has(check.status),
  ).length;
  const tomorrowDate = advanceDate(report?.report_date ?? null, 1);
  const approvalDate = project.client_approved_at;
  const openChanges = drawings.filter((d) => d.status === 'changes_requested');
  const hero = images[0];
  const nav = [
    { href: '#overview', title: 'Overview', icon: 'home' },
    { href: '#project-timeline', title: 'Timeline', icon: 'progress' },
    { href: '#site-progress', title: 'Site updates', icon: 'calendar' },
    { href: '#materials', title: 'Materials', icon: 'truck' },
    { href: '#quality-checks', title: 'Quality checks', icon: 'shield' },
    { href: '#photos', title: 'Photos', icon: 'camera' },
    { href: '#drawings', title: 'Drawings', icon: 'file' },
    { href: '#approvals', title: 'Approvals', icon: 'check' },
    { href: '#payment-requests', title: 'Payments', icon: 'file' },
  ];
  return (
    <div className="pc-root" id="overview">
      <aside className="pc-sidebar" aria-label="Client app navigation">
        <Link href="/client" className="pc-brand">
          <span className="pc-brand-mark">
            <Icon name="home" />
          </span>
          <span>
            ProPulse <b>Client</b>
          </span>
        </Link>
        <p className="pc-sidebar-overline">PROJECT WORKSPACE</p>
        <nav className="pc-side-links">
          {nav.map((item, i) => (
            <a
              key={item.href}
              href={item.href}
              className={i === 0 ? 'pc-side-link is-active' : 'pc-side-link'}
            >
              <Icon name={item.icon} size={18} />
              <span>{item.title}</span>
            </a>
          ))}
        </nav>
        <form action={signOut} className="pc-side-logout">
          <button type="submit">
            <Icon name="arrow" size={16} /> Sign out
          </button>
        </form>
        <div className="pc-side-foot">
          <span className="pc-side-foot-symbol">
            <Icon name="shield" size={24} />
          </span>
          <b>Your project, clearly visible.</b>
          <p>
            Private updates, verified progress and transparent communication.
          </p>
        </div>
      </aside>
      <div className="pc-body">
        <header className="pc-topbar">
          <Link href="/client" className="pc-mobile-brand">
            <span className="pc-brand-mark">
              <Icon name="home" size={19} />
            </span>
            ProPulse <b>Client</b>
          </Link>
          <div className="pc-searchbox">
            <Icon name="search" size={17} />
            <input
              aria-label="Search project information"
              placeholder="Search updates, materials, documents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>
          <div className="pc-top-user">
            <span className="pc-avatar">
              {(clientEmail || 'C').slice(0, 1).toUpperCase()}
            </span>
            <span className="pc-user-caption">
              <b>Client dashboard</b>
              <small title={clientEmail}>{clientEmail}</small>
            </span>
            <form action={signOut} className="pc-mobile-logout">
              <button type="submit" aria-label="Sign out" title="Sign out">
                <Icon name="arrow" size={16} />
              </button>
            </form>
          </div>
        </header>
        <div className="pc-dashboard">
          <div className="pc-content">
            <section className="pc-project-hero" aria-label="Project overview">
              <div className="pc-hero-image">
                {hero ? (
                  <img
                    src={'/client/media/' + hero.id}
                    alt="Project site progress"
                  />
                ) : (
                  <div className="pc-house-art">
                    <Icon name="home" size={42} />
                    <span>YOUR PROJECT</span>
                  </div>
                )}
              </div>
              <div className="pc-project-meta">
                <p className="pc-eyebrow">YOUR LIVE PROJECT</p>
                <h1>{project.name}</h1>
                <div className="pc-tags">
                  <span>{project.code}</span>
                  <span>{project.company_name}</span>
                  <span className="pc-tag-green">{pretty(project.stage)}</span>
                </div>
                <p className="pc-hero-subtitle">
                  Construction & interior updates, shared by your team.
                </p>
              </div>
              <div className="pc-hero-progress">
                <div
                  className="pc-progress-ring"
                  role="img"
                  aria-label={
                    progress === null
                      ? 'Progress unavailable'
                      : progress + '% of project stages complete'
                  }
                  style={{
                    background:
                      'conic-gradient(#2563eb ' +
                      (progress ?? 0) +
                      '%, #e9f0ff 0)',
                  }}
                >
                  <div>
                    <b>{progress === null ? '—' : progress + '%'}</b>
                  </div>
                </div>
                <div>
                  <small>PROJECT PROGRESS</small>
                  <strong>
                    {progress === null
                      ? 'Awaiting plan'
                      : progress + '% complete'}
                  </strong>
                  <span>
                    {timeline.length
                      ? stageDone +
                        ' of ' +
                        timeline.length +
                        ' stages complete'
                      : 'Stage timeline not ready'}
                  </span>
                </div>
              </div>
            </section>

            <div className="pc-kpi-grid">
              <div className="pc-kpi">
                <span className="pc-kpi-icon blue">
                  <Icon name="progress" size={22} />
                </span>
                <div>
                  <small>Overall progress</small>
                  <strong>{progress === null ? '—' : progress + '%'}</strong>
                  <p>
                    {timeline.length
                      ? stageDone + ' stages verified complete'
                      : 'Not reported'}
                  </p>
                </div>
              </div>
              <div className="pc-kpi">
                <span className="pc-kpi-icon violet">
                  <Icon name="users" size={22} />
                </span>
                <div>
                  <small>Today's labour</small>
                  <strong>
                    {reportIsToday ? (report?.worker_count ?? '—') : '—'}
                  </strong>
                  <p>
                    {reportIsToday
                      ? 'As reported by site'
                      : 'No report for today'}
                  </p>
                </div>
              </div>
              <div className="pc-kpi">
                <span className="pc-kpi-icon cyan">
                  <Icon name="truck" size={22} />
                </span>
                <div>
                  <small>Materials delivered</small>
                  <strong>
                    {delivered}
                    {' / '}
                    {metrics.materials.length}
                  </strong>
                  <p>Tracked material lines</p>
                </div>
              </div>
              <div className="pc-kpi">
                <span className="pc-kpi-icon orange">
                  <Icon name="shield" size={22} />
                </span>
                <div>
                  <small>Pending quality checks</small>
                  <strong>{pendingChecks}</strong>
                  <p>{metrics.checks.length} total tracked</p>
                </div>
              </div>
            </div>

            <section
              id="project-timeline"
              className="pc-panel pc-timeline-summary"
            >
              <div className="pc-section-head">
                <div>
                  <h2>Project timeline</h2>
                  <p>Milestones from the approved project plan</p>
                </div>
                <a className="pc-view-link" href="#full-timeline">
                  View full timeline <Icon name="arrow" size={14} />
                </a>
              </div>
              {timeline.length ? (
                <div className="pc-horizontal-timeline" role="list">
                  {timeline.map((stage, i) => {
                    const done = doneStates.has(stage.status),
                      selected = stage.id === current?.id;
                    return (
                      <div
                        className={
                          'pc-tl-point ' +
                          (done ? 'is-done ' : '') +
                          (selected ? 'is-current' : '')
                        }
                        key={stage.id}
                        role="listitem"
                      >
                        <div className="pc-tl-track">
                          <span className="pc-tl-dot">
                            {done ? '✓' : i + 1}
                          </span>
                        </div>
                        <strong title={stage.title}>{stage.title}</strong>
                        <small>
                          {done
                            ? stage.completed_at
                              ? fmt(stage.completed_at, {
                                  day: 'numeric',
                                  month: 'short',
                                  timeZone: 'UTC',
                                })
                              : 'Completed'
                            : selected
                              ? pretty(stage.status)
                              : 'Upcoming'}
                        </small>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="pc-empty">
                  The project team has not published a detailed work timeline
                  yet.
                </p>
              )}
            </section>

            <div className="pc-mid-grid">
              <section className="pc-panel" id="site-progress">
                {cardHeader(
                  "Today's site progress",
                  '#site-history',
                  report
                    ? 'Latest update · ' + fmt(report.report_date)
                    : 'No reports yet',
                )}
                {report?.completed_work ? (
                  <div className="pc-check-list">
                    {report.completed_work
                      .split(/\n+/)
                      .filter(Boolean)
                      .slice(0, 5)
                      .map((part, i) => (
                        <div key={i}>
                          <span className="pc-mini-check">
                            <Icon name="check" size={13} />
                          </span>
                          <p>{short(part.trim(), 155)}</p>
                        </div>
                      ))}
                  </div>
                ) : (
                  <p className="pc-empty">
                    Work completed will appear after the site engineer posts a
                    report.
                  </p>
                )}
                {report?.checks_done && (
                  <p className="pc-soft-note">
                    Quality checks reported: {short(report.checks_done, 180)}
                  </p>
                )}
              </section>
              <section className="pc-panel" id="tomorrow">
                {cardHeader(
                  "Tomorrow's work plan",
                  '#site-history',
                  report?.report_date
                    ? 'Based on report · ' + fmt(report.report_date)
                    : 'Waiting for site plan',
                )}
                {report?.tomorrow_plan ? (
                  <div className="pc-task-list">
                    {report.tomorrow_plan
                      .split(/\n+/)
                      .filter(Boolean)
                      .slice(0, 5)
                      .map((part, i) => (
                        <p key={i}>
                          <Icon name="calendar" size={15} />
                          <span>{short(part.trim(), 155)}</span>
                        </p>
                      ))}
                  </div>
                ) : (
                  <p className="pc-empty">No next-day tasks shared yet.</p>
                )}
                <div className="pc-tomorrow-foot">
                  <div>
                    <Icon name="users" size={19} />
                    <span>
                      <small>Planned labour</small>
                      <b>{report?.tomorrow_workers ?? 'Not reported'}</b>
                    </span>
                  </div>
                  <div>
                    <Icon name="truck" size={19} />
                    <span>
                      <small>Materials needed</small>
                      <b>
                        {
                          metrics.materials.filter(
                            (m) => m.status === 'requested',
                          ).length
                        }{' '}
                        requested
                      </b>
                    </span>
                  </div>
                </div>
                {tomorrowDate && (
                  <p className="pc-footnote">
                    Next-day plan for {fmt(tomorrowDate)}. Confirm with your
                    site engineer if the report is old.
                  </p>
                )}
              </section>
              <section className="pc-panel" id="materials">
                {cardHeader(
                  'Materials delivery status',
                  '#all-materials',
                  'Based on actual receipts and material requests',
                )}
                {materials.length ? (
                  <div className="pc-material-list">
                    <div className="pc-material-header">
                      <span>Material</span>
                      <span>Expected</span>
                      <span>Status</span>
                    </div>
                    {materials.slice(0, 7).map((item, i) => (
                      <div key={i} className="pc-material-row">
                        <b title={item.description}>
                          {short(item.description, 45)}
                        </b>
                        <small>
                          {deliveryExpectation(item, metrics.local_date)}
                        </small>
                        <span className={'pc-pill ' + statusTone(item.status)}>
                          {pretty(item.status)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="pc-empty">
                    Material orders and received deliveries will appear here.
                  </p>
                )}
              </section>
            </div>

            <section id="quality-checks" className="pc-panel pc-qa">
              {cardHeader(
                'Quality checks',
                '#all-quality',
                'Inspections and quality clearance updates',
              )}
              <div className="pc-quality-grid">
                {checks.length ? (
                  checks.slice(0, 5).map((check, i) => (
                    <div className="pc-quality-item" key={i}>
                      <span
                        className={
                          'pc-quality-icon ' + statusTone(check.status)
                        }
                      >
                        <Icon
                          name={
                            positiveStates.has(check.status)
                              ? 'shield'
                              : 'clock'
                          }
                          size={20}
                        />
                      </span>
                      <b>{check.name}</b>
                      <small>
                        {check.completed_at
                          ? fmt(check.completed_at)
                          : check.due_date
                            ? fmt(check.due_date)
                            : 'Date not set'}
                      </small>
                      <span className={'pc-pill ' + statusTone(check.status)}>
                        {pretty(check.status)}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="pc-empty">
                    No quality inspections have been posted yet.
                  </p>
                )}
              </div>
            </section>

            <div className="pc-bottom-grid">
              <section id="photos" className="pc-panel">
                {cardHeader('Site photos & updates', '#all-photos')}
                {images.length ? (
                  <div className="pc-photo-grid">
                    {images.slice(0, 4).map((photo) => (
                      <a
                        key={photo.id}
                        href={'/client/media/' + photo.id}
                        target="_blank"
                        rel="noreferrer"
                        className="pc-photo"
                      >
                        <img
                          src={'/client/media/' + photo.id}
                          alt={photo.caption || photo.filename}
                          loading="lazy"
                        />
                        <b>
                          {short(photo.caption || pretty(photo.category), 38)}
                        </b>
                        <small>{fmt(photo.created_at)}</small>
                      </a>
                    ))}
                    {images.length > 4 && (
                      <a href="#all-photos" className="pc-more-photo">
                        <span>+{images.length - 4}</span>More photos
                      </a>
                    )}
                  </div>
                ) : (
                  <p className="pc-empty">
                    The engineer's daily photos and watchman's curing photos
                    will appear here.
                  </p>
                )}
              </section>
              <section id="drawings" className="pc-panel">
                {cardHeader('Designs & documents', '#all-documents')}
                <div className="pc-document-list">
                  {drawings.length ? (
                    drawings.slice(0, 5).map((d) => (
                      <div key={d.kind}>
                        <Icon name="file" size={16} />
                        <span title={d.reference}>
                          <b>{pretty(d.kind)}</b>
                          <small>Rev {d.revision}</small>
                        </span>
                        <span className={'pc-pill ' + statusTone(d.status)}>
                          {pretty(d.status)}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="pc-empty">No drawings submitted yet.</p>
                  )}
                </div>
              </section>
              <section id="approvals" className="pc-panel">
                {cardHeader('Client approvals', '#design-review')}
                <div className="pc-approval-list">
                  <div>
                    <span className="pc-mini-check">
                      <Icon name={approvalDate ? 'check' : 'clock'} size={13} />
                    </span>
                    <p>
                      <b>Design approval</b>
                      <small>
                        {approvalDate ? fmt(approvalDate) : 'Awaiting review'}
                      </small>
                    </p>
                  </div>
                  {openChanges.map((d) => (
                    <div key={d.kind}>
                      <span className="pc-alert-icon">!</span>
                      <p>
                        <b>{pretty(d.kind)} changes</b>
                        <small>Revision requested</small>
                      </p>
                    </div>
                  ))}
                  <div>
                    <span className="pc-alert-icon">i</span>
                    <p>
                      <b>Project stage updates</b>
                      <small>View each stage in the timeline</small>
                    </p>
                  </div>
                </div>
              </section>
            </div>

            <ClientProjectRequests projectId={project.id} requests={requests} />
            <details id="full-timeline" className="pc-details-panel">
              <summary>
                <Icon name="layers" size={19} /> Full project work timeline{' '}
                <span>Expand stages</span>
              </summary>
              <ClientProjectTimeline
                stages={timeline}
                unavailable={timelineUnavailable}
              />
            </details>
            <section id="all-materials" className="pc-panel pc-expand-section">
              {cardHeader('All materials & delivery records', '#materials')}
              <div className="pc-record-list">
                {materials.length ? (
                  materials.map((m, i) => (
                    <article key={i}>
                      <Icon name="truck" size={19} />
                      <div>
                        <b>{m.description}</b>
                        <small>
                          {m.ordered_quantity
                            ? m.ordered_quantity + ' ' + (m.unit ?? '') + ' · '
                            : ''}
                          {m.received_date
                            ? 'Received ' + fmt(m.received_date)
                            : m.expected_date
                              ? 'Expected ' +
                                deliveryExpectation(m, metrics.local_date)
                              : m.status === 'ordered'
                                ? 'Ordered · delivery date pending'
                                : m.status === 'approved'
                                  ? 'Approved · not yet ordered'
                                  : 'Awaiting order approval'}
                        </small>
                      </div>
                      <span className={'pc-pill ' + statusTone(m.status)}>
                        {pretty(m.status)}
                      </span>
                    </article>
                  ))
                ) : (
                  <p className="pc-empty">
                    No recorded material requests or receipts.
                  </p>
                )}
              </div>
            </section>
            <section id="all-quality" className="pc-panel pc-expand-section">
              {cardHeader('All quality checks', '#quality-checks')}
              <div className="pc-record-list">
                {checks.length ? (
                  checks.map((check, i) => (
                    <article key={i}>
                      <Icon name="shield" size={19} />
                      <div>
                        <b>{check.name}</b>
                        <small>
                          {check.due_date
                            ? 'Scheduled ' + fmt(check.due_date)
                            : 'No scheduled date'}
                        </small>
                      </div>
                      <span className={'pc-pill ' + statusTone(check.status)}>
                        {pretty(check.status)}
                      </span>
                    </article>
                  ))
                ) : (
                  <p className="pc-empty">No quality checks published yet.</p>
                )}
              </div>
            </section>
            <section id="site-history" className="pc-panel pc-expand-section">
              {cardHeader('Site update history', '#site-progress')}
              <div className="pc-history-list">
                {project.reports.length ? (
                  project.reports.map((r, i) => (
                    <article key={i}>
                      <b>{fmt(r.report_date)}</b>
                      <p>{r.completed_work || 'No completed work recorded.'}</p>
                      <small>
                        Next work: {r.tomorrow_plan || 'Not shared'}
                      </small>
                    </article>
                  ))
                ) : (
                  <p className="pc-empty">No reports recorded.</p>
                )}
              </div>
            </section>
            <section id="all-photos" className="pc-panel pc-expand-section">
              {cardHeader('All site photos', '#photos')}
              {images.length ? (
                <div className="pc-gallery">
                  {images.map((photo) => (
                    <a
                      key={photo.id}
                      href={'/client/media/' + photo.id}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <img
                        src={'/client/media/' + photo.id}
                        alt={photo.caption || photo.filename}
                        loading="lazy"
                      />
                      <b>{photo.caption || pretty(photo.category)}</b>
                    </a>
                  ))}
                </div>
              ) : (
                <p className="pc-empty">No shared site photos.</p>
              )}
            </section>
            <section
              id="payment-requests"
              className="pc-panel pc-expand-section"
            >
              <div className="pc-section-head">
                <div>
                  <h2>Invoices &amp; payment requests</h2>
                  <p>
                    Issued bills from your builder. A bill is not a payment
                    receipt.
                  </p>
                </div>
              </div>
              {paymentRequests.length > 0 && (
                <div className="pc-record-list">
                  {paymentRequests.map((request) => (
                    <article
                      key={request.id}
                      className="pc-file-link"
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: 12,
                        justifyContent: 'space-between',
                      }}
                    >
                      <div style={{ display: 'grid', gap: 5 }}>
                        <b>{request.label}</b>
                        <small>
                          {request.number} · Certified milestone payment request
                        </small>
                        <strong>
                          ₹
                          {request.total.toLocaleString('en-IN', {
                            maximumFractionDigits: 2,
                            minimumFractionDigits: 2,
                          })}
                        </strong>
                        {(() => {
                          const related = paymentProofs.filter(
                            (p) => p.requestId === request.id,
                          );
                          const latest = related[0];
                          const approved = related.filter(
                            (p) => p.status === 'approved',
                          );
                          const paid = approved.reduce(
                            (sum, p) => sum + p.amount,
                            0,
                          );
                          const remaining = Math.max(
                            0,
                            Math.round((request.total - paid) * 100) / 100,
                          );
                          const pending = related.find(
                            (p) => p.status === 'pending',
                          );
                          return (
                            <div style={{ display: 'grid', gap: 6 }}>
                              <strong>
                                {remaining === 0
                                  ? 'Paid and verified'
                                  : pending
                                    ? 'Bank verification pending'
                                    : paid > 0
                                      ? 'Partially paid · Balance outstanding'
                                      : latest?.status === 'rejected'
                                        ? 'Evidence rejected — resubmit'
                                        : 'Payment requested'}
                              </strong>
                              {paid > 0 && (
                                <small>
                                  Verified: ₹{paid.toLocaleString('en-IN')}
                                  {' · Balance: ₹' +
                                    remaining.toLocaleString('en-IN')}
                                </small>
                              )}
                              {latest && (
                                <small>
                                  Latest bank reference: {latest.reference}
                                </small>
                              )}
                              {latest?.reviewNote && (
                                <small>{latest.reviewNote}</small>
                              )}
                              {related.map((proof) => (
                                <div
                                  key={proof.id}
                                  style={{
                                    display: 'flex',
                                    gap: 12,
                                    flexWrap: 'wrap',
                                    alignItems: 'center',
                                  }}
                                >
                                  <a
                                    href={
                                      '/client/payment-proofs/' +
                                      proof.id +
                                      '/file?project=' +
                                      project.id
                                    }
                                    className="pc-view-link"
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    {proof.status === 'approved'
                                      ? 'Verified evidence'
                                      : proof.status === 'pending'
                                        ? 'Pending evidence'
                                        : 'Submitted evidence'}
                                  </a>
                                  {proof.status === 'approved' &&
                                    proof.receiptId && (
                                      <a
                                        href={
                                          '/client/payment-proofs/' +
                                          proof.id +
                                          '/receipt?project=' +
                                          project.id
                                        }
                                        className="pc-view-link"
                                      >
                                        Official receipt
                                      </a>
                                    )}
                                </div>
                              ))}
                              {remaining > 0 && !pending && (
                                <ClientPaymentProofForm
                                  projectId={project.id}
                                  requestId={request.id}
                                  amount={remaining}
                                />
                              )}
                            </div>
                          );
                        })()}
                      </div>
                      <a
                        href={
                          '/client/payment-requests/' +
                          request.id +
                          '/pdf?project=' +
                          project.id
                        }
                        className="pc-view-link"
                        download
                      >
                        <Icon name="file" size={16} /> Download PDF{' '}
                        <Icon name="arrow" size={14} />
                      </a>
                    </article>
                  ))}
                </div>
              )}
              {invoices.length ? (
                <div className="pc-record-list">
                  {invoices.map((invoice) => (
                    <article
                      key={invoice.id}
                      className="pc-file-link"
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: 12,
                        justifyContent: 'space-between',
                      }}
                    >
                      <div style={{ display: 'grid', gap: 5 }}>
                        <b>{invoice.number}</b>
                        <small>
                          {invoice.documentType === 'tax_invoice'
                            ? 'GST invoice'
                            : invoice.documentType === 'bill_of_supply'
                              ? 'Bill of Supply'
                              : 'Invoice'}
                          {' · Issued ' + fmt(invoice.date)}
                        </small>
                        <strong>
                          ₹
                          {invoice.total.toLocaleString('en-IN', {
                            maximumFractionDigits: 2,
                            minimumFractionDigits: 2,
                          })}
                        </strong>
                        <small>
                          Payment requested · Due: {fmt(invoice.dueDate)}
                        </small>
                      </div>
                      <a
                        href={
                          '/client/invoices/' +
                          invoice.id +
                          '/pdf?project=' +
                          project.id
                        }
                        className="pc-view-link"
                        download
                      >
                        <Icon name="file" size={16} /> Download PDF{' '}
                        <Icon name="arrow" size={14} />
                      </a>
                    </article>
                  ))}
                </div>
              ) : paymentRequests.length === 0 ? (
                <p className="pc-empty">
                  No issued payment requests for this project.
                </p>
              ) : null}
            </section>
            <section id="all-documents" className="pc-panel pc-expand-section">
              {cardHeader('Shared documents', '#drawings')}
              {pdfs.length ? (
                <div className="pc-record-list">
                  {pdfs.map((doc) => (
                    <a
                      key={doc.id}
                      href={'/client/media/' + doc.id}
                      target="_blank"
                      rel="noreferrer"
                      className="pc-file-link"
                    >
                      <Icon name="file" size={19} />
                      {doc.caption || doc.filename}
                      <Icon name="arrow" size={15} />
                    </a>
                  ))}
                </div>
              ) : (
                <p className="pc-empty">
                  Documents shared with your project will appear here.
                </p>
              )}
            </section>
            <section id="design-review" className="pc-panel pc-expand-section">
              <h2>Review & approve drawings</h2>
              {project.stage === 'design' && drawings.length ? (
                <ClientDesignReview
                  projectId={project.id}
                  drawings={drawings}
                />
              ) : (
                <p className="pc-empty">
                  There are no drawings awaiting client approval at this stage.
                </p>
              )}
            </section>
            <p className="pc-privacy">
              <Icon name="shield" size={17} /> Private project access. Site
              progress and material receipts are posted by your construction
              team. For urgent safety matters, contact your project manager
              directly.
            </p>
          </div>

          <aside className="pc-activity" aria-label="Recent project activity">
            <div className="pc-section-head">
              <div>
                <h2>Recent updates</h2>
                <p>Your project activity feed</p>
              </div>
            </div>
            <div className="pc-activity-items">
              {recent.length ? (
                recent.map((update, i) => (
                  <article key={i} className="pc-activity-item">
                    <span className="pc-activity-avatar">
                      <Icon
                        name={
                          update.category === 'photo'
                            ? 'camera'
                            : update.category === 'quality'
                              ? 'shield'
                              : update.category === 'material'
                                ? 'truck'
                                : 'calendar'
                        }
                        size={17}
                      />
                    </span>
                    <div>
                      <b>
                        {update.category === 'photo'
                          ? 'Site photo'
                          : update.category === 'quality'
                            ? 'Quality update'
                            : update.category === 'material'
                              ? 'Material receipt'
                              : 'Site engineer update'}
                      </b>
                      <small>{fmt(update.created_at)}</small>
                      <p>{short(update.summary, 200)}</p>
                    </div>
                  </article>
                ))
              ) : (
                <p className="pc-empty">
                  New project updates will appear here.
                </p>
              )}
            </div>
            <a className="pc-activity-all" href="#site-history">
              View all site updates <Icon name="arrow" size={17} />
            </a>
            {metricsUnavailable && (
              <p className="pc-muted-warning">
                Some live delivery or quality data is temporarily unavailable.
              </p>
            )}
          </aside>
        </div>
      </div>
      <nav className="pc-mobile-tabs" aria-label="Mobile project navigation">
        {[
          { href: '#overview', title: 'Home', icon: 'home' },
          { href: '#project-timeline', title: 'Timeline', icon: 'progress' },
          { href: '#materials', title: 'Materials', icon: 'truck' },
          { href: '#quality-checks', title: 'Checks', icon: 'shield' },
          { href: '#photos', title: 'Photos', icon: 'camera' },
        ].map((item) => (
          <a href={item.href} key={item.href}>
            <Icon name={item.icon} size={19} />
            <span>{item.title}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}
