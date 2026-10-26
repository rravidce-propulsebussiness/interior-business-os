/* eslint-disable @next/next/no-html-link-for-pages -- Use fresh document navigations on Hostinger to avoid interrupted RSC Flight responses. */
'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { OwnerIcon, type OwnerIconName } from '../../owner-shell';
import { QuickAddLead } from './quick-add-lead';
import type {QuickRequirementField} from '../requirement-fields';
import { LeadRemovalButton } from './lead-removal-button';
import { LeadStageSelect, LeadPrioritySelect, LeadFollowUpSetter } from './lead-inline-controls';
import { LeadQuotePreview } from './lead-quote-preview';
import { quoteFloorsFromLead, leadFloorLabel } from '../../quotations/lead-floor-count';
import { allLeadsHref as resetLeadsHref } from './lead-filter-links';
import { LeadUpdateComposer } from './lead-update-composer';
import type { LeadServiceOption } from './lead-service-options';
import { leadCategoryLabel, type LeadCategory } from './lead-category';
import { LeadsBoardView } from './board-view';
import { LeadBulkToolbar } from './lead-bulk-toolbar';
import { LeadDetailsDrawer } from './lead-details-drawer';
import { leadDateRangeSelection, type LeadDateRange } from './date-range';
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
  category: LeadCategory;
  requirements: Record<string, string>;
  projectSize: string;
  budgetMin: string | null;
  budgetMax: string | null;
  notes: string;
  nextFollowUpAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  expectedStartDate: string | null;
  convertedProjectId: string | null;
  quotationProjectId: string | null;
  convertedCustomerId: string | null;
  quoteRevisionId: string | null;
  quoteStatus: string | null;
  quoteNumber: string | null;
  quoteAmount: string | null;
  quoteShared: boolean;
  latestUpdate: string;
  latestUpdateAt: string | null;
  latestUpdateSubject: string;
};

const path = '/dashboard/crm/leads';
const dateChoices: ReadonlyArray<{ value: LeadDateRange; label: string }> = [
  { value: '', label: 'Any time' },
  { value: 'last_week', label: 'Last week' },
  { value: 'last_month', label: 'Last month' },
  { value: 'this_month', label: 'This month' },
  { value: 'custom', label: 'Custom date' },
];
const number = new Intl.NumberFormat('en-IN');

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

export function LeadsWorkspace({
  rows,
  stats,
  tabs,
  stages,
  sources,
  services,
  requirementFields,
  assignees,
  branches,
  params,
  count,
  page,
  prevHref,
  nextHref,
  canCreate,
  canConfigureCrm,
  canManage,
  canWin,
  canConvert,
  canViewProject,
  canQuote,
  canShareQuote,
  canAssign,
  canNote,
  canFollowUp,
  canVisit,
  lostReasons,
  organizationName,
  timeZone,
  propulseConnection,
  activityPanel,
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
  services: LeadServiceOption[];
  requirementFields: QuickRequirementField[];
  assignees: LeadOption[];
  branches: LeadOption[];
  lostReasons: LeadOption[];
  params: Record<string, string | undefined>;
  count: number;
  page: number;
  prevHref: string | null;
  nextHref: string | null;
  canCreate: boolean;
  canConfigureCrm: boolean;
  canManage: boolean;
  canAssign: boolean;
  canWin: boolean;
  canNote: boolean;
  canFollowUp: boolean;
  canVisit: boolean;
  canConvert: boolean;
  canViewProject: boolean;
  canQuote: boolean;
  canShareQuote: boolean;
  organizationName: string;
  timeZone: string;
  asOf: string;
  propulseConnection: ProPulseConnectionView;
  activityPanel: ReactNode;
  initialTool: 'none' | 'add' | 'propulse';
}) {
  const [openedId, setOpenedId] = useState<string | null>(null);
  const [expandedMobileId, setExpandedMobileId] = useState<string | null>(null);
  const [leadTool, setLeadTool] = useState<'none' | 'add' | 'propulse'>(
    initialTool,
  );
  const viewMode = params.view === 'board' ? 'board' : 'list';
  // Filter reset must not preserve stage_id (or any other active filters).
  // Previously the "Clear" action called viewLink(), keeping the same one-lead
  // stage selection and making users think other leads had disappeared.
  const allLeadsHref = resetLeadsHref(viewMode);
  const activeStageName = stages.find((stage) => stage.id === params.stage_id)?.name;
  const hasActiveFilters = [
    'q','stage_id','source_id','branch_id','priority','due','range','from',
    'until','lifecycle','assigned_to','unassigned',
  ].some((key) => Boolean(params[key]));
  const [dateRange, setDateRange] = useState<LeadDateRange>(() =>
    leadDateRangeSelection(params),
  );
  const viewLink = (nextView: 'list' | 'board') => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value && !['panel', 'view', 'converted', 'assigned_to', 'unassigned'].includes(key)) query.set(key, value);
    }
    if (nextView === 'board') query.set('view', 'board');
    const string = query.toString();
    return string ? path + '?' + string : path;
  };
  const [syncFeedback, setSyncFeedback] = useState('');
  const [checked, setChecked] = useState<string[]>([]);
  const eligibleRows = rows.filter((lead) => lead.lifecycle === 'open');
  const selectedRows = eligibleRows.filter((lead) => checked.includes(lead.id));
  const allSelected = eligibleRows.length > 0 && selectedRows.length === eligibleRows.length;
  const activePriorityQuery = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && key !== 'page' && key !== 'priority' && key !== 'panel') activePriorityQuery.set(key, value);
  }
  if (params.priority !== 'high') activePriorityQuery.set('priority', 'high');
  const highPriorityHref = path + (activePriorityQuery.toString() ? '?' + activePriorityQuery.toString() : '');
  const open = (lead: LeadView) => setOpenedId(lead.id);
  const openedLead = rows.find((lead) => lead.id === openedId) ?? null;
  const toggle = (id: string) =>
    setChecked((old) =>
      old.includes(id) ? old.filter((value) => value !== id) : [...old, id],
    );

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
      <div className="crm-leads-heading">
        <div className="crm-premium-heading-title">
          <span className="crm-premium-heading-icon"><OwnerIcon name="leads" size={24} /></span>
          <div><h1>Leads</h1>
            <p>Manage construction, interior and renovation enquiries.</p></div>
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
          <details className="crm-premium-menu">
            <summary className="crm-outline">More <Icon name="more" /></summary>
            <div className="crm-premium-menu-list">
              {canCreate && <a href="/dashboard/crm/leads/upload">Import leads</a>}
              {canCreate && <a href="/dashboard/crm/leads/google-sheets">Google Sheets</a>}
              <button type="button" onClick={() => setLeadTool(leadTool === 'propulse' ? 'none' : 'propulse')}>
                {propulseConnection.connected ? 'ProPulse connection' : 'Connect ProPulse'}
              </button>
              <a href={viewLink(viewMode === 'list' ? 'board' : 'list')}>
                {viewMode === 'list' ? 'Board view' : 'List view'}
              </a>
              <button type="button" disabled={!rows.length}
                onClick={() => downloadCsv(checked.length ? rows.filter((row) => checked.includes(row.id)) : rows)}>
                Export visible leads
              </button>
            </div>
          </details>
        </div>
      </div>

      <div id="crm-inline-action">
        {leadTool === 'add' && canCreate && (
          <QuickAddLead
            canConfigureCrm={canConfigureCrm}
            services={services}
            requirementFields={requirementFields}
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

      <nav className="crm-activity-filters" aria-label="Lead and activity filters">
        <a aria-current={!params.activity ? 'page' : undefined} href="/dashboard/crm/leads">All Leads</a>
        <a aria-current={params.activity === 'followups' && params.queue === 'today' ? 'page' : undefined}
          href="/dashboard/crm/leads?activity=followups&queue=today#lead-activities">Due Today</a>
        <a aria-current={params.activity === 'visits' && params.queue === 'upcoming' ? 'page' : undefined}
          href="/dashboard/crm/leads?activity=visits&queue=upcoming#lead-activities">Upcoming Visits</a>
        <a aria-current={params.activity === 'followups' && params.queue === 'overdue' ? 'page' : undefined}
          href="/dashboard/crm/leads?activity=followups&queue=overdue#lead-activities">Overdue</a>
        <a aria-current={params.activity === 'followups' && !params.queue ? 'page' : undefined}
          href="/dashboard/crm/leads?activity=followups#lead-activities">All Follow-ups</a>
      </nav>
      {params.activity && <section className="crm-activity-embedded" id="lead-activities">
        <div className="crm-activity-heading">
          <div><h2>{params.activity === 'visits' ? 'Scheduled visits' : 'Scheduled follow-ups'}</h2>
            <p>Manage calls and visits without leaving Leads. Open a lead to schedule more.</p></div>
          <a href="/dashboard/crm/leads">← All Leads</a>
        </div>
        {activityPanel}
      </section>}
      {!params.activity && <>
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
              {dateRange && <span className="crm-date-summary">
                {dateChoices.find((choice) => choice.value === dateRange)?.label}
              </span>}
            </summary>
            <div className="crm-advanced-panel">
              <div className="crm-date-filter">
                <span className="crm-date-filter-title">Lead created date</span>
                <div className="crm-date-options" role="radiogroup" aria-label="Lead date range">
                  {dateChoices.map((choice) => (
                    <label key={choice.value || 'any'} className={
                      'crm-date-preset' + (dateRange === choice.value ? ' is-selected' : '')
                    }>
                      <input
                        type="radio"
                        name="range"
                        value={choice.value}
                        checked={dateRange === choice.value}
                        onChange={() => setDateRange(choice.value)}
                      />
                      <span>{choice.label}</span>
                    </label>
                  ))}
                </div>
                {dateRange === 'custom' && (
                  <div className="crm-date-custom">
                    <label>
                      From date
                      <input type="date" name="from" defaultValue={params.from ?? ''} />
                    </label>
                    <label>
                      To date
                      <input type="date" name="until" defaultValue={params.until ?? ''} />
                    </label>
                  </div>
                )}
              </div>
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
              <label className="crm-check-option">
                <input
                  type="checkbox"
                  name="due"
                  value="true"
                  defaultChecked={params.due === 'true'}
                />{' '}
                Follow-up due
              </label>
            </div>
          </details>
          <button type="submit" className="crm-filter-apply">
            Apply
          </button>
          <a className="crm-filter-clear" href={allLeadsHref}>
            Clear all filters
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
          {hasActiveFilters && <div className="crm-active-filter-notice" role="status">
            <span>
              Showing {number.format(count)} filtered {count === 1 ? 'lead' : 'leads'}
              {activeStageName ? ' · Stage: ' + activeStageName : ''}
            </span>
            <a href={allLeadsHref}>View all leads</a>
          </div>}
          <div className="crm-premium-selection">
            <div className="crm-premium-select-actions">
              <label><input type="checkbox" checked={allSelected}
                disabled={!eligibleRows.length}
                onChange={() => setChecked(allSelected ? [] : eligibleRows.map((row) => row.id))}/>
                Select filtered page ({eligibleRows.length})
              </label>
              <a className={params.priority === 'high' ? 'crm-priority-active' : ''} href={highPriorityHref}>
                {params.priority === 'high' ? '✓ High priority' : '⚑ High priority'}
              </a>
            </div>
            <small>Bulk actions apply only to selected open leads on this page.</small>
          </div>
          <LeadBulkToolbar
            selected={selectedRows} visible={eligibleRows}
            assignees={assignees} stages={stages}
            canAssign={canAssign} canManage={canManage}
            canFollowUp={canFollowUp} onClear={() => setChecked([])}
          />
          {rows.length ? (
            <>
              {viewMode === 'board' ? (
                <LeadsBoardView
                  rows={rows}
                  stages={stages}
                  canManage={canManage}
                  canWin={canWin}
                  canNote={canNote}
                  canFollowUp={canFollowUp}
                  onOpen={open}
                />
              ) : (
                <>
                  <div className="crm-leads-table-wrap">
                    <table className="crm-leads-table">
                      <colgroup>
                        <col className="crm-col-check" />
                        <col className="crm-col-customer" />
                        <col className="crm-col-requirement" />
                        <col className="crm-col-status" />
                        <col className="crm-col-priority" />
                        <col className="crm-col-followup" />
                        <col className="crm-col-quote" />
                        <col className="crm-col-actions" />
                      </colgroup>
                      <thead>
                        <tr>
                          <th className="crm-checkbox-col">
                            <input
                              aria-label="Select all visible leads"
                              type="checkbox"
                              checked={allSelected}
                              disabled={!eligibleRows.length}
                              onChange={() =>
                                setChecked(allSelected ? [] : eligibleRows.map((row) => row.id))
                              }
                            />
                          </th>
                          <th>Customer / Details</th>
                          <th>Requirement</th>
                          <th>Status</th>
                          <th>Priority</th>
                          <th>Next follow-up</th>
                          <th>Quotation</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((lead, i) => (
                          <tr key={lead.id} className={checked.includes(lead.id) ? 'crm-lead-row crm-row-selected' : 'crm-lead-row'}>
                            <td>
                              <input
                                aria-label={'Select ' + lead.name}
                                type="checkbox"
                                checked={checked.includes(lead.id)}
                                disabled={lead.lifecycle !== 'open'}
                                onChange={() => toggle(lead.id)}
                              />
                            </td>
                            <td>
                              <button
                                type="button"
                                className="crm-lead-identity"
                                onClick={() => open(lead)}
                                aria-label={
                                  'Open lead details for ' + lead.name
                                }
                              >
                                <span
                                  className={'crm-avatar crm-avatar-' + (i % 5)}
                                >
                                  {firstLetters(lead.name)}
                                </span>
                                <span>
                                  <strong>{lead.name}</strong>
                                  <span
                                    className={
                                      'crm-lead-service-badge crm-lead-service-' +
                                      (lead.category ?? 'unclassified')
                                    }
                                  >
                                    {leadCategoryLabel(lead.category)}
                                  </span>
                                  <small>{lead.phone || lead.number || 'No number'}</small>
                                  {lead.location && <small className="crm-premium-location">{lead.location}</small>}
                                  {lead.latestUpdate && <small className="crm-lead-update-peek" title={lead.latestUpdate}>
                                    {lead.latestUpdateSubject || 'Update'}: {lead.latestUpdate}
                                  </small>}
                                </span>
                              </button>
                            </td>
                            <td>
                              <span className="crm-cell-text">
                                {lead.requirement ||
                                  lead.projectSize ||
                                  'Not specified'}
                                {lead.category === 'construction' && quoteFloorsFromLead(lead.requirements) &&
                                  <small className="crm-lead-floor-chip">{leadFloorLabel(quoteFloorsFromLead(lead.requirements))}</small>}
                              </span>
                            </td>
                            <td>
                              <LeadStageSelect
                                lead={lead}
                                stages={stages}
                                lostReasons={lostReasons}
                                canManage={canManage}
                                canWin={canWin} canConvert={canConvert}
                                 canViewProject={canViewProject}
                              />
                            </td>
                            <td>
                              <LeadPrioritySelect lead={lead} canManage={canManage} />
                            </td>
                            <td>
                              <LeadFollowUpSetter lead={lead} canFollowUp={canFollowUp} />
                            </td>
                            <td>
                              {lead.quoteRevisionId && (!lead.quoteAmount || Number(lead.quoteAmount) <= 0) && !lead.quoteShared ? (
                                <div className="crm-quote-pending">
                                  <span>No priced quotation yet</span>
                                  <a href={'/dashboard/quotations/' + encodeURIComponent(lead.quoteRevisionId) + '/studio?step=quote'}>
                                    Continue quotation
                                  </a>
                                </div>
                              ) : lead.quoteRevisionId ? (
                                <div className="crm-quote-stack">
                                  <LeadQuotePreview
                                    revisionId={lead.quoteRevisionId}
                                    number={lead.quoteNumber || 'Quotation'}
                                    status={lead.quoteStatus}
                                    amount={lead.quoteAmount}
                                    shared={lead.quoteShared} canShare={canShareQuote}
                                    newQuoteHref={canQuote
                                      ? '/dashboard/quotations/new?lead=' + encodeURIComponent(lead.id)
                                      : undefined}
                                  />
                                </div>
                              ) : canQuote ? (
                                <div className="crm-quote-pending">
                                  <span>No quote yet</span>
                                  <a href={'/dashboard/quotations/new?lead=' + encodeURIComponent(lead.id)}>
                                    + Create Quote
                                  </a>
                                </div>
                              ) : <span className="crm-muted">No quotation</span>}
                            </td>
                            <td>
                              <div className="crm-row-actions">
                                {canNote && lead.lifecycle !== 'archived' &&
                                  <LeadUpdateComposer leadId={lead.id} leadName={lead.name} canFollowUp={canFollowUp}/>}
                                <div className="crm-row-icon-actions">
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
                                <details className="crm-premium-row-more">
                                  <summary aria-label={'More actions for ' + lead.name} title="More">•••</summary>
                                  <div className="crm-premium-row-menu">
                                    <a href={path + '/' + encodeURIComponent(lead.id)}>View history</a>
                                    {canManage && lead.lifecycle !== 'archived' &&
                                      <LeadRemovalButton id={lead.id} name={lead.name} version={lead.version}/>}
                                  </div>
                                </details>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="crm-mobile-list">
                    {rows.map((lead, i) => {
                      const expanded = expandedMobileId === lead.id;
                      const quoteHref = '/dashboard/quotations/new?lead=' + encodeURIComponent(lead.id);
                      const pricedQuote = Boolean(lead.quoteRevisionId &&
                        (lead.quoteShared || (lead.quoteAmount && Number(lead.quoteAmount) > 0)));
                      return (
                      <article className="crm-mobile-card crm-compact-lead" key={lead.id}>
                        <div className="crm-compact-top">
                          <input type="checkbox" aria-label={'Select ' + lead.name}
                            checked={checked.includes(lead.id)}
                            disabled={lead.lifecycle !== 'open'}
                            onChange={() => toggle(lead.id)}/>
                          <span className={'crm-avatar crm-avatar-' + (i % 5)}>{firstLetters(lead.name)}</span>
                          <button className="crm-compact-identity" type="button" onClick={() => open(lead)}
                            aria-label={'Open lead ' + lead.name}>
                            <strong>{lead.name}</strong>
                            <small>{lead.phone || lead.number}</small>
                            {lead.location && <small>{lead.location}</small>}
                          </button>
                          <span className="crm-compact-date">{lead.nextFollowUpAt ? date(lead.nextFollowUpAt,false,timeZone) : 'No follow-up'}</span>
                        </div>
                        <p className="crm-compact-requirement">{lead.requirement || lead.projectSize || 'Requirement not specified'}</p>
                        <div className="crm-compact-chips">
                          <span>{lead.stageName}</span>
                          <span className={'crm-premium-priority crm-premium-priority-' + lead.priority}>{lead.priority}</span>
                          {lead.category === 'construction' && quoteFloorsFromLead(lead.requirements) &&
                            <span>{leadFloorLabel(quoteFloorsFromLead(lead.requirements))}</span>}
                        </div>
                        {pricedQuote ? (
                          <button className="crm-compact-quote-toggle" type="button"
                            aria-expanded={expanded} onClick={() => setExpandedMobileId(expanded ? null : lead.id)}>
                            <span>Quote {lead.quoteNumber || ''} · {lead.quoteAmount && Number(lead.quoteAmount)>0
                              ? '₹' + Number(lead.quoteAmount).toLocaleString('en-IN') : 'Shared'}</span>
                            <span>{expanded ? 'Less −' : 'Details +'}</span>
                          </button>
                        ) : <div className="crm-compact-quote-empty">
                          <span>{lead.quoteRevisionId ? 'Quotation not priced yet' : 'No quote yet'}</span>
                          {canQuote && <a href={lead.quoteRevisionId
                            ? '/dashboard/quotations/'+encodeURIComponent(lead.quoteRevisionId)+'/studio?step=quote'
                            : quoteHref}>
                            {lead.quoteRevisionId ? 'Continue' : '+ Create Quote'}
                          </a>}
                        </div>}
                        <div className="crm-compact-actions">
                          {canNote && lead.lifecycle !== 'archived' &&
                            <LeadUpdateComposer leadId={lead.id} leadName={lead.name} canFollowUp={canFollowUp}/>}
                          {lead.phoneNormalized && <a href={'tel:' + safePhone(lead.phoneNormalized)}
                            aria-label={'Call '+lead.name}><Icon name="phone"/></a>}
                          {whatsapp(lead.phoneNormalized || lead.phone) && <a
                            href={'https://wa.me/' + whatsapp(lead.phoneNormalized || lead.phone)}
                            target="_blank" rel="noopener noreferrer" aria-label={'WhatsApp '+lead.name}>
                            <Icon name="whatsapp"/></a>}
                          <button className="crm-compact-expand" type="button"
                            aria-expanded={expanded}
                            onClick={() => setExpandedMobileId(expanded ? null : lead.id)}>
                            {expanded ? 'Less −' : 'More +'}
                          </button>
                        </div>
                        {expanded && <div className="crm-compact-expanded">
                          {lead.latestUpdate && <p className="crm-compact-last"><strong>Last update:</strong> {lead.latestUpdate}</p>}
                          <div className="crm-mobile-inline-grid">
                            <div className="crm-mobile-stage"><span>Stage</span>
                              <LeadStageSelect lead={lead} stages={stages} lostReasons={lostReasons}
                                canManage={canManage} canWin={canWin} canConvert={canConvert}
                                canViewProject={canViewProject}/></div>
                            <label>Priority <LeadPrioritySelect lead={lead} canManage={canManage}/></label>
                            <label className="crm-mobile-followup">Next follow-up
                              <LeadFollowUpSetter lead={lead} canFollowUp={canFollowUp}/></label>
                          </div>
                          {pricedQuote && lead.quoteRevisionId && <LeadQuotePreview
                            revisionId={lead.quoteRevisionId}
                            number={lead.quoteNumber || 'Quotation'} status={lead.quoteStatus}
                            amount={lead.quoteAmount} shared={lead.quoteShared}
                            canShare={canShareQuote}
                            newQuoteHref={canQuote ? quoteHref : undefined}/>}
                          <div className="crm-compact-secondary">
                            <a href={path + '/' + encodeURIComponent(lead.id)}>View history</a>
                            {canManage && lead.lifecycle !== 'archived' &&
                              <LeadRemovalButton id={lead.id} name={lead.name} version={lead.version}/>}
                          </div>
                        </div>}
                      </article>
                    );})}
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
                <a href={allLeadsHref}>View all leads</a>
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
      </section>
      </>}
      {openedLead && <LeadDetailsDrawer
        lead={openedLead} onClose={() => setOpenedId(null)}
        stages={stages} lostReasons={lostReasons} assignees={assignees}
        canManage={canManage} canWin={canWin} canConvert={canConvert}
                                 canViewProject={canViewProject}
        canFollowUp={canFollowUp} canVisit={canVisit} canNote={canNote} canQuote={canQuote}
      />}
      <p className="crm-leads-scope">
        Showing authorized leads for {organizationName}. CSV export includes
        only records visible on this page.
      </p>
    </main>
  );
}
