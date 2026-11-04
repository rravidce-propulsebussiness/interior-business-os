'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { ProjectEntry } from '../projects/project-v2-types';
import { projectCategory } from './portfolio';

type Filter = 'all' | 'ongoing' | 'completed' | 'on_hold' | 'attention';

export function PortfolioBoard({
  projects,
  attention,
  canExecution,
  canTasks,
}: {
  projects: ProjectEntry[];
  attention: Record<string, number> | null;
  canExecution: boolean;
  canTasks: boolean;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('newest');
  const matching = useMemo(() => {
    const term = query.trim().toLowerCase();
    const selection = projects.filter((project) => {
      const category = projectCategory(project.status);
      const matches = [
        project.name,
        project.code,
        project.client,
        project.address,
        project.industry,
      ]
        .join(' ')
        .toLowerCase()
        .includes(term);
      return (
        matches &&
        (filter === 'all' ||
          (filter === 'attention'
            ? (attention?.[project.id] ?? 0) > 0
            : category === filter))
      );
    });
    return selection.sort((left, right) => {
      if (sort === 'name') return left.name.localeCompare(right.name);
      if (sort === 'progress')
        return (right.progress ?? -1) - (left.progress ?? -1);
      return right.createdAt.localeCompare(left.createdAt);
    });
  }, [projects, attention, filter, query, sort]);

  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All projects' },
    { key: 'ongoing', label: 'Ongoing' },
    { key: 'completed', label: 'Completed' },
    { key: 'on_hold', label: 'On hold' },
    ...(attention
      ? [{ key: 'attention' as const, label: 'Needs attention' }]
      : []),
  ];

  return (
    <section className="pm-board" aria-labelledby="pm-portfolio-title">
      <div className="pm-panel-heading">
        <div>
          <span className="pm-eyebrow">DELIVERY PORTFOLIO</span>
          <h2 id="pm-portfolio-title">Manage projects</h2>
          <p>Open the canonical project workspace, tasks and site execution.</p>
        </div>
        <Link className="pm-text-link" href="/dashboard/projects">
          Open project directory →
        </Link>
      </div>
      <div className="pm-controls">
        <label className="pm-search">
          <span>Search projects</span>
          <input
            type="search"
            value={query}
            placeholder="Name, client, location or project code"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label className="pm-sort">
          <span>Sort by</span>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          >
            <option value="newest">Newest first</option>
            <option value="name">Project name</option>
            <option value="progress">Physical progress</option>
          </select>
        </label>
      </div>
      <div className="pm-filters" aria-label="Filter project status">
        {filters.map((item) => (
          <button
            type="button"
            key={item.key}
            className={
              filter === item.key ? 'pm-filter is-active' : 'pm-filter'
            }
            aria-pressed={filter === item.key}
            onClick={() => setFilter(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="pm-results" role="status">
        Showing {matching.length} of {projects.length} accessible projects
      </div>
      <div className="pm-project-grid">
        {matching.map((project) => {
          const category = projectCategory(project.status);
          const count = attention?.[project.id] ?? 0;
          const projectUrl = '/dashboard/projects/' + project.id;
          const queryString = '?project=' + encodeURIComponent(project.id);
          return (
            <article className="pm-project-card" key={project.id}>
              <div className="pm-project-topline">
                <span className={'pm-state is-' + category}>
                  {project.status.replaceAll('_', ' ')}
                </span>
                {attention && count > 0 && (
                  <span className="pm-risk">{count} work alerts</span>
                )}
              </div>
              <h3>
                <Link href={projectUrl}>{project.name}</Link>
              </h3>
              <p className="pm-project-meta">
                {project.code || 'Project'} · {project.client}
              </p>
              <p className="pm-project-location">
                {project.industry} · {project.address}
              </p>
              <div className="pm-progress-heading">
                <span>Measured task progress</span>
                <strong>
                  {project.progress === null
                    ? 'Not tracked'
                    : project.progress + '%'}
                </strong>
              </div>
              <div
                className="pm-progress-track"
                role="progressbar"
                aria-label={project.name + ' measured task progress'}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={project.progress ?? undefined}
                aria-valuetext={
                  project.progress === null
                    ? 'Not tracked'
                    : project.progress + '%'
                }
              >
                <span style={{ width: (project.progress ?? 0) + '%' }} />
              </div>
              <div className="pm-project-actions">
                <Link className="pm-project-primary" href={projectUrl}>
                  Project workspace
                </Link>
                {canExecution && (
                  <Link href={'/dashboard/operations' + queryString}>
                    Site execution
                  </Link>
                )}
                {canTasks && (
                  <Link
                    href={'/dashboard/project-management/tasks' + queryString}
                  >
                    Tasks
                  </Link>
                )}
              </div>
            </article>
          );
        })}
        {!matching.length && (
          <div className="pm-empty">
            <strong>
              {projects.length
                ? 'No matching projects'
                : 'No projects recorded yet'}
            </strong>
            <p>
              {projects.length
                ? 'Adjust the search or status filter.'
                : 'Create a project from a Won lead or an existing customer.'}
            </p>
            <Link href="/dashboard/projects">Open projects →</Link>
          </div>
        )}
      </div>
    </section>
  );
}
