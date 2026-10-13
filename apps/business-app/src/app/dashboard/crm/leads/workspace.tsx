/* eslint-disable @next/next/no-html-link-for-pages -- Use fresh document navigations on Hostinger to avoid interrupted RSC Flight responses. */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { OwnerIcon, type OwnerIconName } from '../../owner-shell';
import { runCrmCommand, saveCrm } from '../actions';
import { QuickAddLead } from './quick-add-lead';
import { LeadsBoardView } from './board-view';
import {
  ProPulseConnectPanel,
  type ProPulseConnectionView,
} from './propulse-connect-panel';
import { syncPropulseLeads } from './propulse-actions';

export type LeadOption = { value: string; label: string };
export type LeadStage = { id: string; name: string; outcome: string };
export type LeadTab = {
  label: string;
  href: string;
  count: number | null;
  active: boolean;
};
export type LeadView = {
  id: string;
  version: number;
  name: string;
  number: string;
  companyName: string;
  phone: string;
  phoneNormalized: string;
  email: string;
  source: string;
  priority: string;
  lifecycle: string;
  stageId: string;
  stageName: string;
  assignedTo: string;
  assignedName: string;
  location: string;
  requirement: string;
  projectSize: string;
  budgetMin: string | null;
  budgetMax: string | null;
  notes: string;
  nextFollowUpAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  expectedStartDate: string | null;
  convertedProjectId: string | null;
  convertedCustomerId: string | null;
};

const path = '/dashboard/crm/leads';
const number = new Intl.NumberFormat('en-IN');
const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

type ActionIcon =
  | 'phone'
  | 'whatsapp'
  | 'download'
  | 'filter'
  | 'more'
  | 'mail'
  | 'pin'
  | 'file'
  | 'clock'
  | 'edit'
  | 'eye'
  | 'chevron';
const iconPaths: Record<ActionIcon, string> = {
  phone:
    'M7 3H4a1 1 0 0 0-1 1c0 9.5 7.5 17 17 17a1 1 0 0 0 1-1v-3.4a1 1 0 0 0-.8-1l-4-1a1 1 0 0 0-1 .3l-1.8 1.8a15 15 0 0 1-6-6L9.4 8a1 1 0 0 0 .3-1l-1-4A1 1 0 0 0 7.7 3Z',
  whatsapp:
    'M12 2a10 10 0 0 0-8.5 15.2L3 21l4-1a10 10 0 1 0 5-18Zm-4 7a5 5 0 0 0 7 7',
  download: 'M12 3v13m-5-5 5 5 5-5M4 18v3h16v-3',
  filter: 'M3 5h18l-7 8v6l-4 2v-8L3 5Z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  mail: 'M3 5h18v14H3zM3 6l9 8 9-8',
  pin: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM12 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4',
  file: 'M6 2h9l5 5v15H6zM15 2v6h5M9 12h8M9 16h8',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 7v6l4 2',
  edit: 'M12 20H4v-8L16 0l8 8-12 12ZM14 6l4 4',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12ZM12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  chevron: 'm9 6 6 6-6 6',
};
function Icon({ name, size = 17 }: { name: ActionIcon; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={iconPaths[name]} />
    </svg>
  );
}

function safePhone(value: string) {
  return value.replace(/[^+0-9]/g, '');
}
function whatsapp(value: string) {
  return value.replace(/\D/g, '');
}
function date(
  value: string | null,
  includeTime = false,
  timeZone = 'Asia/Kolkata',
) {
  if (!value) return 'Not scheduled';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return 'Not scheduled';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(includeTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  }).format(parsed);
}
function firstLetters(value: string) {
  return (
    value
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('') || 'LD'
  );
}
function text(value: string) {
  return value.trim() || 'Not provided';
}
function budget(min: string | null, max: string | null) {
  if (!min && !max) return 'Not specified';
  if (min && max)
    return currency.format(Number(min)) + ' – ' + currency.format(Number(max));
  return currency.format(Number(min || max)) + (min ? ' +' : '');
}
function statusTone(lead: LeadView) {
  if (lead.lifecycle === 'won' || lead.convertedProjectId) return 'green';
  if (lead.lifecycle === 'lost') return 'red';
  if (lead.lifecycle === 'archived') return 'neutral';
  if (/quot/i.test(lead.stageName)) return 'purple';
  if (/follow|contact/i.test(lead.stageName)) return 'amber';
  return 'blue';
}
function due(lead: LeadView, asOf: string, timeZone: string) {
  if (!lead.nextFollowUpAt) return 'none';
  const d = new Date(lead.nextFollowUpAt).getTime();
  if (!Number.isFinite(d)) return 'none';
  if (d < new Date(asOf).getTime()) return 'late';
  const day = new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return day.format(new Date(lead.nextFollowUpAt)) ===
    day.format(new Date(asOf))
    ? 'today'
    : 'future';
}
function csvValue(value: string) {
  const escaped = /^[=+\-@\t\r]/.test(value.trimStart()) ? "'" + value : value;
  return '"' + escaped.replaceAll('"', '""') + '"';
}
function downloadCsv(rows: LeadView[]) {
  if (!rows.length) return;
  const keys: Array<[string, (row: LeadView) => string]> = [
    ['Lead number', (row) => row.number],
    ['Name', (row) => row.name],
    ['Phone', (row) => row.phone],
    ['Email', (row) => row.email],
    ['Requirement', (row) => row.requirement],
    ['Location', (row) => row.location],
    ['Stage', (row) => row.stageName],
    ['Outcome', (row) => row.lifecycle],
    ['Priority', (row) => row.priority],
    ['Source', (row) => row.source],
    ['Assigned to', (row) => row.assignedName],
    ['Follow-up', (row) => row.nextFollowUpAt ?? ''],
    ['Notes', (row) => row.notes],
  ];
  const csv =
    '\uFEFF' +
    [
      keys.map(([key]) => csvValue(key)).join(','),
      ...rows.map((row) =>
        keys.map(([, accessor]) => csvValue(accessor(row))).join(','),
      ),
    ].join('\r\n');
  const url = URL.createObjectURL(
    new Blob([csv], { type: 'text/csv;charset=utf-8' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = 'propulse-leads-visible-page.csv';
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="crm-detail-field">
      <span>{label}</span>
      <strong>{children}</strong>
    </div>
  );
}

export function LeadsWorkspace({
  rows,
  stats,
  tabs,
  stages,
  sources,
  assignees,
  branches,
  lostReasons,
  params,
  count,
  page,
  prevHref,
  nextHref,
  canCreate,
  canManage,
  canAssign,
  canWin,
  canNote,
  canConvert,
  canQuote,
  organizationName,
  timeZone,
  asOf,
  propulseConnection,
  initialTool,
}: {
  rows: LeadView[];
  stats: {
    label: string;
    value: string;
    note: string;
    icon: OwnerIconName;
    tone: string;
  }[];
  tabs: LeadTab[];
  stages: LeadStage[];
  sources: LeadOption[];
  assignees: LeadOption[];
  branches: LeadOption[];
  lostReasons: LeadOption[];
  params: Record<string, string | undefined>;
  count: number;
  page: number;
  prevHref: string | null;
  nextHref: string | null;
  canCreate: boolean;
  canManage: boolean;
  canAssign: boolean;
  canWin: boolean;
  canNote: boolean;
  canConvert: boolean;
  canQuote: boolean;
  organizationName: string;
  timeZone: string;
  asOf: string;
  propulseConnection: ProPulseConnectionView;
  initialTool: 'none' | 'add' | 'propulse';
}) {
  const [leadTool, setLeadTool] = useState<
    'none' | 'add' | 'propulse'
  >(initialTool);
  const viewMode = params.view === 'board' ? 'board' : 'list';
  const viewLink = (nextView: 'list' | 'board') => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value && !['panel', 'view'].includes(key)) query.set(key, value);
    }
    if (nextView === 'board') query.set('view', 'board');
    const string = query.toString();
    return string ? path + '?' + string : path;
  };
  const [syncFeedback, setSyncFeedback] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(
    rows[0]?.id ?? null,
  );
  const [checked, setChecked] = useState<string[]>([]);
  const [paneTab, setPaneTab] = useState<
    'details' | 'notes' | 'activity' | 'quotes' | 'projects'
  >('details');
  const [stageId, setStageId] = useState(rows[0]?.stageId ?? '');
  const [assignId, setAssignId] = useState(rows[0]?.assignedTo ?? '');
  const [lostReason, setLostReason] = useState('');
  const [stageNote, setStageNote] = useState('');
  const [noteText, setNoteText] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const selected = useMemo(
    () => rows.find((row) => row.id === selectedId) ?? null,
    [rows, selectedId],
  );
  const chosenStage = stages.find((stage) => stage.id === stageId);
  const allSelected = rows.length > 0 && checked.length === rows.length;
  const canSaveStage =
    canManage &&
    chosenStage &&
    selected &&
    stageId !== selected.stageId &&
    (chosenStage.outcome !== 'won' || (canWin && stageNote.trim())) &&
    (chosenStage.outcome !== 'lost' || lostReason);
  const open = (lead: LeadView) => {
    setSelectedId(lead.id);
    setStageId(lead.stageId);
    setAssignId(lead.assignedTo);
    setLostReason('');
    setStageNote('');
    setFeedback('');
    setNoteText('');
    setPaneTab('details');
  };
  const toggle = (id: string) =>
    setChecked((old) =>
      old.includes(id) ? old.filter((value) => value !== id) : [...old, id],
    );
  const run = async (task: () => Promise<{ message: string }>) => {
    setBusy(true);
    setFeedback('');
    try {
      const response = await task();
      if (/^(Saved\.|Updated\.)$/.test(response.message)) {
        window.location.reload();
        return;
      }
      setFeedback(response.message || 'Could not save changes.');
    } catch {
      setFeedback('Could not save changes. Check your connection and retry.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (
      !propulseConnection.connected ||
      !canCreate ||
      !propulseConnection.configured
    )
      return;
    let active = true;
    const check = async () => {
      try {
        const response = await syncPropulseLeads();
        if (!active) return;
        if (response.ok && (response.created ?? 0) > 0) {
          window.location.reload();
        } else if (!response.ok) {
          setSyncFeedback(response.message);
        }
      } catch {
        if (active)
          setSyncFeedback('ProPulse sync is temporarily unavailable.');
      }
    };
    void check();
    const timer = window.setInterval(() => void check(), 120000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [propulseConnection.connected, propulseConnection.configured, canCreate]);

  useEffect(() => {
    if (leadTool === 'none') return;
    document.getElementById('crm-inline-action')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }, [leadTool]);

  return (
    <main id="main-content" tabIndex={-1} className="crm-leads-root">
      <div className="crm-leads-breadcrumb">
        <a href="/dashboard">Workspace</a>
        <Icon name="chevron" size={13} />
        <a href="/dashboard/crm">CRM</a>
        <Icon name="chevron" size={13} />
        <strong>Leads</strong>
      </div>
      <div className="crm-leads-heading">
        <div>
          <h1>Leads</h1>
          <p>Track enquiries, assign follow-ups, and convert faster.</p>
        </div>
        <div className="crm-leads-header-actions">
          {canCreate && (
            <button
              type="button"
              className="crm-primary"
              aria-expanded={leadTool === 'add'}
              onClick={() => setLeadTool(leadTool === 'add' ? 'none' : 'add')}
            >
              <OwnerIcon name="plus" size={17} /> Add Lead
            </button>
          )}
          {canCreate && (
            <>
              <a className="crm-outline" href="/dashboard/crm/leads/upload">
                <Icon name="download" /> Upload Leads
              </a>
              <a className="crm-outline" href="/dashboard/crm/leads/google-sheets">
                Google Sheets
              </a>
            </>
          )}
          <button
            type="button"
            className="crm-outline"
            aria-expanded={leadTool === 'propulse'}
            onClick={() =>
              setLeadTool(leadTool === 'propulse' ? 'none' : 'propulse')
            }
          >
            {propulseConnection.connected
              ? 'ProPulse Connected'
              : 'Connect ProPulse'}
          </button>
          <nav className="crm-view-toggle" aria-label="Lead display">
            <a
              href={viewLink('list')}
              aria-current={viewMode === 'list' ? 'page' : undefined}
              className={viewMode === 'list' ? 'crm-view-active' : ''}
            >
              List View
            </a>
            <a
              href={viewLink('board')}
              aria-current={viewMode === 'board' ? 'page' : undefined}
              className={viewMode === 'board' ? 'crm-view-active' : ''}
            >
              Board View
            </a>
          </nav>
          <button
            type="button"
            className="crm-outline"
            disabled={!rows.length}
            onClick={() =>
              downloadCsv(
                checked.length
                  ? rows.filter((row) => checked.includes(row.id))
                  : rows,
              )
            }
          >
            <Icon name="download" /> Export{' '}
            {checked.length ? 'selected' : 'page'}
          </button>
        </div>
      </div>

      <div id="crm-inline-action">
        {leadTool === 'add' && canCreate && (
          <QuickAddLead
            sources={sources.filter(
              (source) => !/propulse/i.test(source.label),
            )}
            stages={stages
              .filter((stage) => stage.outcome === 'open')
              .map((stage) => ({ value: stage.id, label: stage.name }))}
            onClose={() => setLeadTool('none')}
          />
        )}
        {leadTool === 'propulse' && (
          <ProPulseConnectPanel
            connection={propulseConnection}
            onClose={() => setLeadTool('none')}
          />
        )}
        {syncFeedback && (
          <p className="crm-integration-message" role="status">
            {syncFeedback}
          </p>
        )}
      </div>

      <div className="crm-kpi-row" aria-label="Lead overview">
        {stats.map((stat) => (
          <div className="crm-kpi-card" key={stat.label}>
            <span className={'crm-kpi-icon crm-kpi-' + stat.tone}>
              <OwnerIcon name={stat.icon} size={24} />
            </span>
            <div>
              <p>{stat.label}</p>
              <strong>{stat.value}</strong>
              <small>{stat.note}</small>
            </div>
          </div>
        ))}
      </div>

      <section className="crm-filter-panel" aria-label="Lead filters">
        <form action={path} method="get" className="crm-filters">
          {viewMode === 'board' && (
            <input type="hidden" name="view" value="board" />
          )}
          <label className="crm-search-field">
            <OwnerIcon name="search" size={18} />
            <input
              aria-label="Search leads"
              type="search"
              name="q"
              placeholder="Search name, phone, requirement..."
              defaultValue={params.q ?? ''}
              maxLength={80}
            />
          </label>
          <label className="crm-filter-select">
            <span className="sr-only">Stage</span>
            <select name="stage_id" defaultValue={params.stage_id ?? ''}>
              <option value="">All stages</option>
              {stages.map((stage) => (
                <option value={stage.id} key={stage.id}>
                  {stage.name}
                </option>
              ))}
            </select>
          </label>
          <label className="crm-filter-select">
            <span className="sr-only">Source</span>
            <select name="source_id" defaultValue={params.source_id ?? ''}>
              <option value="">All sources</option>
              {sources.map((source) => (
                <option key={source.value} value={source.value}>
                  {source.label}
                </option>
              ))}
            </select>
          </label>
          <label className="crm-filter-select">
            <span className="sr-only">Assignee</span>
            <select name="assigned_to" defaultValue={params.assigned_to ?? ''}>
              <option value="">All assignees</option>
              {assignees.map((person) => (
                <option key={person.value} value={person.value}>
                  {person.label}
                </option>
              ))}
            </select>
          </label>
          <label className="crm-filter-select">
            <span className="sr-only">Priority</span>
            <select name="priority" defaultValue={params.priority ?? ''}>
              <option value="">All priorities</option>
              {['low', 'normal', 'high', 'urgent'].map((v) => (
                <option key={v} value={v}>
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label className="crm-filter-select">
            <span className="sr-only">Sort order</span>
            <select name="sort" defaultValue={params.sort ?? 'newest'}>
              {[
                ['newest', 'Newest first'],
                ['oldest', 'Oldest first'],
                ['followup', 'Next follow-up'],
                ['updated', 'Recently updated'],
                ['budget', 'Budget'],
              ].map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <details className="crm-advanced">
            <summary>
              <Icon name="filter" /> More filters
            </summary>
            <div className="crm-advanced-panel">
              <label>
                Created from
                <input
                  type="date"
                  name="from"
                  defaultValue={params.from ?? ''}
                />
              </label>
              <label>
                Created until
                <input
                  type="date"
                  name="until"
                  defaultValue={params.until ?? ''}
                />
              </label>
              <label>
                Outcome
                <select name="lifecycle" defaultValue={params.lifecycle ?? ''}>
                  <option value="">Any outcome</option>
                  {['open', 'won', 'lost', 'archived'].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Branch
                <select name="branch_id" defaultValue={params.branch_id ?? ''}>
                  <option value="">All branches</option>
                  {branches.map((v) => (
                    <option key={v.value} value={v.value}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Conversion
                <select name="converted" defaultValue={params.converted ?? ''}>
                  <option value="">Any</option>
                  <option value="true">Converted</option>
                  <option value="false">Not converted</option>
                </select>
              </label>
              <label className="crm-check-option">
                <input
                  type="checkbox"
                  name="due"
                  value="true"
                  defaultChecked={params.due === 'true'}
                />{' '}
                Follow-up due
              </label>
              <label className="crm-check-option">
                <input
                  type="checkbox"
                  name="unassigned"
                  value="true"
                  defaultChecked={params.unassigned === 'true'}
                />{' '}
                Unassigned only
              </label>
            </div>
          </details>
          <button type="submit" className="crm-filter-apply">
            Apply
          </button>
          <a className="crm-filter-clear" href={viewLink(viewMode)}>
            Clear
          </a>
        </form>
      </section>

      <section className="crm-workspace-grid">
        <div className="crm-list-surface">
          <nav className="crm-stage-tabs" aria-label="Lead stages">
            {tabs.map((tab) => (
              <a
                href={tab.href}
                key={tab.href}
                className={tab.active ? 'crm-tab-active' : ''}
                aria-current={tab.active ? 'page' : undefined}
              >
                {tab.label}
                {tab.count !== null && <span>{number.format(tab.count)}</span>}
              </a>
            ))}
          </nav>
          {checked.length > 0 && (
            <div className="crm-bulk-bar" role="status">
              <strong>{checked.length} selected</strong>
              <button
                type="button"
                onClick={() =>
                  downloadCsv(rows.filter((row) => checked.includes(row.id)))
                }
              >
                <Icon name="download" /> Export selected
              </button>
              <button type="button" onClick={() => setChecked([])}>
                Clear selection
              </button>
            </div>
          )}
          {rows.length ? (
            <>
              {viewMode === 'board' ? (
                <LeadsBoardView
                  rows={rows}
                  stages={stages}
                  canManage={canManage}
                  canWin={canWin}
                  onOpen={open}
                />
              ) : (
                <>
                  <div className="crm-leads-table-wrap">
                    <table className="crm-leads-table">
                      <thead>
                        <tr>
                          <th className="crm-checkbox-col">
                            <input
                              aria-label="Select all visible leads"
                              type="checkbox"
                              checked={allSelected}
                              onChange={() =>
                                setChecked(
                                  allSelected ? [] : rows.map((row) => row.id),
                                )
                              }
                            />
                          </th>
                          <th>Lead</th>
                          <th>Requirement</th>
                          <th>Location</th>
                          <th>Stage</th>
                          <th>Priority</th>
                          <th>Follow-up</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((lead, i) => (
                          <tr
                            key={lead.id}
                            className={
                              selected?.id === lead.id ? 'crm-row-selected' : ''
                            }
                          >
                            <td>
                              <input
                                aria-label={'Select ' + lead.name}
                                type="checkbox"
                                checked={checked.includes(lead.id)}
                                onChange={() => toggle(lead.id)}
                              />
                            </td>
                            <td>
                              <button
                                type="button"
                                className="crm-lead-identity"
                                onClick={() => open(lead)}
                                aria-label={'Preview ' + lead.name}
                              >
                                <span
                                  className={'crm-avatar crm-avatar-' + (i % 5)}
                                >
                                  {firstLetters(lead.name)}
                                </span>
                                <span>
                                  <strong>{lead.name}</strong>
                                  <small>
                                    {lead.phone || lead.number || 'No number'}
                                  </small>
                                </span>
                              </button>
                            </td>
                            <td>
                              <span className="crm-cell-text">
                                {lead.requirement ||
                                  lead.projectSize ||
                                  'Not specified'}
                              </span>
                            </td>
                            <td>
                              <span className="crm-location">
                                <Icon name="pin" size={15} />
                                {lead.location || '—'}
                              </span>
                            </td>
                            <td>
                              <span
                                className={
                                  'crm-chip crm-chip-' + statusTone(lead)
                                }
                              >
                                {lead.stageName}
                              </span>
                            </td>
                            <td>
                              <span
                                className={
                                  'crm-priority crm-priority-' + lead.priority
                                }
                              >
                                {lead.priority}
                              </span>
                            </td>
                            <td>
                              <span
                                className={
                                  'crm-due crm-due-' + due(lead, asOf, timeZone)
                                }
                              >
                                <Icon name="clock" size={15} />
                                {lead.nextFollowUpAt
                                  ? date(lead.nextFollowUpAt, true, timeZone)
                                  : 'Not set'}
                              </span>
                            </td>
                            <td>
                              <div className="crm-row-actions">
                                {lead.phoneNormalized && (
                                  <a
                                    title={'Call ' + lead.name}
                                    aria-label={'Call ' + lead.name}
                                    href={
                                      'tel:' + safePhone(lead.phoneNormalized)
                                    }
                                  >
                                    <Icon name="phone" size={17} />
                                  </a>
                                )}
                                {whatsapp(
                                  lead.phoneNormalized || lead.phone,
                                ) && (
                                  <a
                                    title={'WhatsApp ' + lead.name}
                                    aria-label={'WhatsApp ' + lead.name}
                                    href={
                                      'https://wa.me/' +
                                      whatsapp(
                                        lead.phoneNormalized || lead.phone,
                                      )
                                    }
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <Icon name="whatsapp" size={17} />
                                  </a>
                                )}
                                <button
                                  type="button"
                                  title="Preview details"
                                  aria-label={
                                    'Preview details for ' + lead.name
                                  }
                                  onClick={() => open(lead)}
                                >
                                  <Icon name="more" size={18} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="crm-mobile-list">
                    {rows.map((lead, i) => (
                      <article
                        className={
                          'crm-mobile-card' +
                          (selected?.id === lead.id
                            ? ' crm-mobile-selected'
                            : '')
                        }
                        key={lead.id}
                      >
                        <div className="crm-mobile-header">
                          <span className={'crm-avatar crm-avatar-' + (i % 5)}>
                            {firstLetters(lead.name)}
                          </span>
                          <div>
                            <strong>{lead.name}</strong>
                            <small>{lead.number || lead.phone}</small>
                          </div>
                          <button
                            type="button"
                            onClick={() => open(lead)}
                            aria-label={'Preview ' + lead.name}
                          >
                            <Icon name="chevron" />
                          </button>
                        </div>
                        <p>
                          {lead.requirement ||
                            lead.projectSize ||
                            'No requirement specified'}
                        </p>
                        <div className="crm-mobile-chips">
                          <span
                            className={'crm-chip crm-chip-' + statusTone(lead)}
                          >
                            {lead.stageName}
                          </span>
                          <span
                            className={
                              'crm-priority crm-priority-' + lead.priority
                            }
                          >
                            {lead.priority}
                          </span>
                        </div>
                        <small className="crm-mobile-sub">
                          {lead.location || 'Location not provided'} · Follow-up{' '}
                          {date(lead.nextFollowUpAt, false, timeZone)}
                        </small>
                      </article>
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="crm-leads-empty">
              <OwnerIcon name="leads" size={36} />
              <h2>No leads found</h2>
              <p>
                Try another filter, or add your first enquiry to start the
                pipeline.
              </p>
              <div>
                <a href={viewLink(viewMode)}>Clear filters</a>
                {canCreate && (
                  <button
                    type="button"
                    className="crm-primary"
                    onClick={() => setLeadTool('add')}
                  >
                    Add Lead
                  </button>
                )}
              </div>
            </div>
          )}
          <footer className="crm-list-footer">
            <span>
              {count
                ? 'Showing ' +
                  number.format((page - 1) * 25 + 1) +
                  '–' +
                  number.format((page - 1) * 25 + rows.length) +
                  ' of ' +
                  number.format(count)
                : '0 leads'}{' '}
              · Page {page}
            </span>
            <div>
              <span>25 per page</span>
              {prevHref ? (
                <a href={prevHref} aria-label="Previous page">
                  ‹
                </a>
              ) : (
                <span className="crm-page-disabled">‹</span>
              )}
              <strong>{page}</strong>
              {nextHref ? (
                <a href={nextHref} aria-label="Next page">
                  ›
                </a>
              ) : (
                <span className="crm-page-disabled">›</span>
              )}
            </div>
          </footer>
        </div>

        {selected ? (
          <aside
            className="crm-detail-pane"
            aria-label={'Lead preview for ' + selected.name}
          >
            <div className="crm-detail-header">
              <div className="crm-detail-person">
                <span className="crm-avatar crm-avatar-large">
                  {firstLetters(selected.name)}
                </span>
                <div>
                  <div className="crm-detail-name">
                    <h2>{selected.name}</h2>
                    <span
                      className={'crm-chip crm-chip-' + statusTone(selected)}
                    >
                      {selected.stageName}
                    </span>
                  </div>
                  <p>{selected.number || 'Lead'}</p>
                  <small>
                    Created {date(selected.createdAt, true, timeZone)}
                  </small>
                </div>
              </div>
              <button
                className="crm-detail-close"
                type="button"
                onClick={() => setSelectedId(null)}
                aria-label="Close lead preview"
              >
                <OwnerIcon name="close" size={19} />
              </button>
            </div>
            <div className="crm-detail-actions">
              {selected.phoneNormalized && (
                <a
                  className="crm-call-button"
                  href={'tel:' + safePhone(selected.phoneNormalized)}
                >
                  <Icon name="phone" /> Call
                </a>
              )}
              {whatsapp(selected.phoneNormalized || selected.phone) && (
                <a
                  className="crm-whatsapp-button"
                  href={
                    'https://wa.me/' +
                    whatsapp(selected.phoneNormalized || selected.phone)
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Icon name="whatsapp" /> WhatsApp
                </a>
              )}
              {selected.convertedProjectId && canQuote ? (
                <a
                  className="crm-quote-button"
                  href={
                    '/dashboard/quotations?project=' +
                    selected.convertedProjectId
                  }
                >
                  <Icon name="file" /> Quotations
                </a>
              ) : canConvert && selected.lifecycle === 'open' ? (
                <a
                  className="crm-quote-button"
                  href={path + '/' + selected.id + '/convert'}
                >
                  <Icon name="file" /> Convert lead
                </a>
              ) : null}
            </div>
            <div
              className="crm-detail-tabs"
              role="tablist"
              aria-label="Lead details"
            >
              {(
                [
                  ['details', 'Details'],
                  ['notes', 'Notes'],
                  ['activity', 'Activity'],
                  ['quotes', 'Quotations'],
                  ['projects', 'Projects'],
                ] as const
              ).map(([key, value]) => (
                <button
                  type="button"
                  key={key}
                  role="tab"
                  aria-selected={paneTab === key}
                  onClick={() => setPaneTab(key)}
                >
                  {value}
                </button>
              ))}
            </div>
            <div className="crm-detail-content">
              {paneTab === 'details' && (
                <>
                  <div className="crm-detail-section-heading">
                    <h3>Basic Information</h3>
                    <a href={path + '/' + selected.id}>
                      <Icon name="edit" size={15} /> Edit
                    </a>
                  </div>
                  <div className="crm-detail-fields">
                    <Field label="Name">{selected.name}</Field>
                    <Field label="Status">
                      <span
                        className={'crm-chip crm-chip-' + statusTone(selected)}
                      >
                        {selected.stageName}
                      </span>
                    </Field>
                    <Field label="Phone">{text(selected.phone)}</Field>
                    <Field label="Priority">
                      <span
                        className={
                          'crm-priority crm-priority-' + selected.priority
                        }
                      >
                        {selected.priority}
                      </span>
                    </Field>
                    <Field label="Email">
                      {selected.email ? (
                        <a href={'mailto:' + selected.email}>
                          {selected.email}
                        </a>
                      ) : (
                        'Not provided'
                      )}
                    </Field>
                    <Field label="Assigned to">
                      {selected.assignedName || 'Unassigned'}
                    </Field>
                    <Field label="Location">{text(selected.location)}</Field>
                    <Field label="Next follow-up">
                      {date(selected.nextFollowUpAt, true, timeZone)}
                    </Field>
                    <Field label="Requirement">
                      {text(selected.requirement)}
                    </Field>
                    <Field label="Source">{text(selected.source)}</Field>
                    <Field label="Budget (est.)">
                      {budget(selected.budgetMin, selected.budgetMax)}
                    </Field>
                    <Field label="Expected start">
                      {selected.expectedStartDate || 'Not specified'}
                    </Field>
                  </div>
                  {selected.notes && (
                    <div className="crm-summary">
                      <strong>Requirement summary</strong>
                      <p>{selected.notes}</p>
                    </div>
                  )}
                </>
              )}
              {paneTab === 'notes' && (
                <section className="crm-pane-tab-body">
                  <h3>Notes</h3>
                  <p>{selected.notes || 'No requirement notes recorded.'}</p>
                  <a href={path + '/' + selected.id}>
                    Open full lead notes and history →
                  </a>
                </section>
              )}
              {paneTab === 'activity' && (
                <section className="crm-pane-tab-body">
                  <h3>Activity history</h3>
                  <p>
                    Calls, follow-ups, site visits and updates are recorded in
                    the full lead workspace.
                  </p>
                  <a href={path + '/' + selected.id}>
                    View activity timeline →
                  </a>
                </section>
              )}
              {paneTab === 'quotes' && (
                <section className="crm-pane-tab-body">
                  <h3>Quotations</h3>
                  {selected.convertedProjectId ? (
                    <a
                      href={
                        '/dashboard/quotations?project=' +
                        selected.convertedProjectId
                      }
                    >
                      View project quotations →
                    </a>
                  ) : (
                    <p>
                      Convert the lead into a project before preparing its
                      quotation.
                    </p>
                  )}
                </section>
              )}
              {paneTab === 'projects' && (
                <section className="crm-pane-tab-body">
                  <h3>Linked project</h3>
                  {selected.convertedProjectId ? (
                    <a
                      href={
                        '/dashboard/projects/' + selected.convertedProjectId
                      }
                    >
                      Open linked project →
                    </a>
                  ) : (
                    <p>No project is linked to this lead yet.</p>
                  )}
                </section>
              )}

              {canManage && selected.lifecycle !== 'archived' && (
                <section className="crm-detail-editor">
                  <h3>Update lead stage</h3>
                  <label className="crm-editor-label">
                    Pipeline stage
                    <select
                      value={stageId}
                      onChange={(e) => {
                        setStageId(e.target.value);
                        setStageNote('');
                        setLostReason('');
                      }}
                    >
                      {stages
                        .filter(
                          (stage) =>
                            stage.outcome !== 'won' ||
                            canWin ||
                            stage.id === selected.stageId,
                        )
                        .map((stage) => (
                          <option key={stage.id} value={stage.id}>
                            {stage.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  {chosenStage?.outcome === 'lost' &&
                    stageId !== selected.stageId && (
                      <label className="crm-editor-label">
                        Reason for loss
                        <select
                          value={lostReason}
                          onChange={(e) => setLostReason(e.target.value)}
                        >
                          <option value="">Select a reason</option>
                          {lostReasons.map((reason) => (
                            <option key={reason.value} value={reason.value}>
                              {reason.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  {stageId !== selected.stageId &&
                    (chosenStage?.outcome === 'won' ||
                      chosenStage?.outcome === 'lost') && (
                      <label className="crm-editor-label">
                        Outcome note
                        <textarea
                          rows={2}
                          maxLength={3000}
                          value={stageNote}
                          onChange={(e) => setStageNote(e.target.value)}
                          placeholder="Why is this lead moving to this stage?"
                        />
                      </label>
                    )}
                  <button
                    type="button"
                    className="crm-editor-primary"
                    disabled={!canSaveStage || busy}
                    onClick={() =>
                      run(() =>
                        runCrmCommand({
                          action: 'stage',
                          id: selected.id,
                          version: selected.version,
                          stage_id: stageId,
                          lost_reason_id: lostReason || null,
                          note: stageNote,
                        }),
                      )
                    }
                  >
                    Save stage change
                  </button>
                </section>
              )}
              {canAssign && selected.lifecycle !== 'archived' && (
                <section className="crm-detail-editor">
                  <h3>Assign lead</h3>
                  <div className="crm-inline-editor">
                    <select
                      aria-label="Assignee"
                      value={assignId}
                      onChange={(e) => setAssignId(e.target.value)}
                    >
                      <option value="">Unassigned</option>
                      {assignees.map((member) => (
                        <option value={member.value} key={member.value}>
                          {member.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={busy || assignId === selected.assignedTo}
                      onClick={() =>
                        run(() =>
                          runCrmCommand({
                            action: 'assign',
                            id: selected.id,
                            version: selected.version,
                            assigned_to: assignId || null,
                          }),
                        )
                      }
                    >
                      Assign
                    </button>
                  </div>
                </section>
              )}
              {canNote && selected.lifecycle !== 'archived' && (
                <section className="crm-detail-editor">
                  <h3>Add note</h3>
                  <textarea
                    rows={2}
                    maxLength={10000}
                    placeholder="Record a call or update..."
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                  />
                  <button
                    type="button"
                    className="crm-editor-primary"
                    disabled={busy || !noteText.trim()}
                    onClick={() =>
                      run(() =>
                        saveCrm('lead_activities', {
                          lead_id: selected.id,
                          activity_type: 'note',
                          subject: 'Lead note',
                          body: noteText,
                        }),
                      )
                    }
                  >
                    Save note
                  </button>
                </section>
              )}
              {feedback && (
                <p role="alert" className="crm-action-feedback">
                  {feedback}
                </p>
              )}
            </div>
            <div className="crm-detail-footer">
              <a href={path + '/' + selected.id}>
                <Icon name="eye" /> Open full lead workspace{' '}
                <Icon name="chevron" size={15} />
              </a>
            </div>
          </aside>
        ) : (
          <aside className="crm-detail-placeholder">
            <OwnerIcon name="leads" size={33} />
            <h2>Lead preview</h2>
            <p>Select a lead to view contact details and actions.</p>
            {rows[0] && (
              <button type="button" onClick={() => open(rows[0]!)}>
                Preview first lead
              </button>
            )}
          </aside>
        )}
      </section>
      <p className="crm-leads-scope">
        Showing authorized leads for {organizationName}. CSV export includes
        only records visible on this page.
      </p>
    </main>
  );
}
