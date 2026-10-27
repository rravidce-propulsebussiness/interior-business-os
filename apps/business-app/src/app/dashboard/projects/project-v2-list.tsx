'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { OwnerIcon } from '../owner-shell';
import { type ProjectEntry, pretty } from './project-v2-types';
import { NewProjectForCustomer } from './new-project-for-customer';

export function ProjectsDirectory({
  projects,
  customers = [],
  canCreateProject = false,
  clientName = '',
  clientId = '',
}: {
  projects: ProjectEntry[];
  customers?: { id: string; name: string }[];
  canCreateProject?: boolean;
  clientName?: string;
  clientId?: string;
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const completed = (status: string) =>
    ['completed', 'handover', 'closed'].includes(status);
  const ongoing = (status: string) =>
    ['active', 'in_progress', 'ongoing', 'started'].includes(status);
  const shown = useMemo(
    () =>
      projects.filter((p) => {
        const match = [
          p.name,
          p.client,
          p.address,
          p.code,
          p.projectType,
          p.industry,
        ]
          .join(' ')
          .toLowerCase()
          .includes(search.trim().toLowerCase());
        return (
          match &&
          (filter === 'all' ||
            (filter === 'ongoing' && ongoing(p.status)) ||
            (filter === 'completed' && completed(p.status)) ||
            (filter === 'on_hold' &&
              ['on_hold', 'held', 'inactive'].includes(p.status)) ||
            (filter === 'other' &&
              !completed(p.status) &&
              !ongoing(p.status) &&
              !['on_hold', 'held', 'inactive'].includes(p.status)))
        );
      }),
    [projects, search, filter],
  );
  const tabs = [
    { id: 'all', label: 'All', value: projects.length },
    {
      id: 'ongoing',
      label: 'Ongoing',
      value: projects.filter((p) => ongoing(p.status)).length,
    },
    {
      id: 'completed',
      label: 'Completed',
      value: projects.filter((p) => completed(p.status)).length,
    },
    {
      id: 'on_hold',
      label: 'On Hold',
      value: projects.filter((p) =>
        ['on_hold', 'held', 'inactive'].includes(p.status),
      ).length,
    },
  ];
  return (
    <main id="main-content" className="pv2-page pv2-list-page">
      <div className="pv2-list-heading">
        <div>
          <h1>{clientId ? clientName + ' · Projects' : 'Projects'}</h1>
          <p>
            {clientId
              ? 'All delivery projects for this one customer account. Open a project for execution.'
              : 'Manage all ongoing and completed projects'}
          </p>
        </div>
        {canCreateProject ? (
          <NewProjectForCustomer
            customers={customers}
            initialCustomerId={clientId}
          />
        ) : (
          <Link
            href="/dashboard/crm/leads?status=won"
            className="pv2-button pv2-outline"
          >
            <OwnerIcon name="plus" size={17} /> Open Won Leads
          </Link>
        )}
      </div>
      <label className="pv2-search">
        <OwnerIcon name="search" size={18} />
        <input
          type="search"
          value={search}
          placeholder="Search projects, client or location…"
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search projects"
        />
      </label>
      <nav className="pv2-filter-tabs" aria-label="Project status filters">
        {tabs.map((tab) => (
          <button
            type="button"
            key={tab.id}
            className={filter === tab.id ? 'selected' : ''}
            onClick={() => setFilter(tab.id)}
          >
            {tab.label} <span>{tab.value}</span>
          </button>
        ))}
      </nav>
      {shown.length ? (
        <div className="pv2-project-list">
          {shown.map((p, i) => (
            <Link
              href={'/dashboard/projects/' + p.id}
              className="pv2-project-card"
              key={p.id}
            >
              <div className={'pv2-project-visual tone-' + (i % 4)}>
                <OwnerIcon name="projects" size={35} />
              </div>
              <div className="pv2-project-card-body">
                <strong>{p.name}</strong>
                <small>
                  <OwnerIcon name="projects" size={13} />
                  {p.industry} · {p.address}
                </small>
                <small>
                  <OwnerIcon name="clients" size={13} />
                  {p.client} · {p.projectType || 'Project'} · {p.code || '—'}
                </small>
              </div>
              <div className="pv2-card-end">
                <span
                  className={
                    'pv2-status ' +
                    (completed(p.status)
                      ? 'good'
                      : ongoing(p.status)
                        ? 'good'
                        : 'warn')
                  }
                >
                  {pretty(p.status)}
                </span>
                <div className="pv2-card-progress">
                  <div className="pv2-bar">
                    <span style={{ width: (p.progress ?? 0) + '%' }} />
                  </div>
                  <strong>
                    {p.progress === null ? 'Not tracked' : p.progress + '%'}
                  </strong>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="pv2-blank pv2-directory-empty">
          <OwnerIcon name="projects" size={36} />
          <h2>
            {projects.length ? 'No matching projects' : 'No projects yet'}
          </h2>
          <p>
            {projects.length
              ? 'Try another status or search term.'
              : clientId
                ? 'This customer has no delivery projects yet. Use New Project above.'
                : 'Start from a Won lead, or choose an existing customer in New Project above.'}
          </p>
          <Link href="/dashboard/crm/leads" className="pv2-button pv2-primary">
            Open Leads
          </Link>
        </div>
      )}
    </main>
  );
}
