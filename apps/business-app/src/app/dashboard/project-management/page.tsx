import Link from 'next/link';
import { notFound } from 'next/navigation';
import { canAccess } from '@business-os/auth';
import { pageServices } from '@business-os/auth/server';
import { OwnerShell, OwnerIcon } from '../owner-shell';
import { ownerWorkspaceNavigation } from '../owner-workspace-navigation';
import { projectIndex } from '../projects/project-v2-data';
import type { PortfolioTask } from './portfolio';
import { portfolioSnapshot } from './portfolio';
import { PortfolioBoard } from './portfolio-board';
import '../owner-dashboard.css';
import './project-management.css';

export const dynamic = 'force-dynamic';

export default async function ProjectManagementPage() {
  const { s, list, org, user } = await projectIndex();
  const has = (permission: string, moduleKey?: string) =>
    canAccess(s.context, {
      organizationId: s.org,
      permission,
      ...(moduleKey ? { moduleKey } : {}),
    });
  if (!has('project.view', 'projects')) notFound();

  const canTasks = has('task.view', 'projects');
  const canExecution = has('execution.view', 'projects');
  const canMilestones = has('milestone.view', 'projects');
  const canCreateProject = has('project.create', 'projects');
  const timeZone = org.default_timezone || 'UTC';
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  let tasks: PortfolioTask[] | null = null;
  let coverage: 'ready' | 'restricted' | 'unavailable' | 'limited' = canTasks
    ? 'unavailable'
    : 'restricted';
  // ProjectIndex itself is capped. Never advertise partial counts as totals.
  if (canTasks && list.length < 250) {
    if (!list.length) {
      tasks = [];
      coverage = 'ready';
    } else {
      const { client } = await pageServices();
      const chunks: string[][] = [];
      for (let index = 0; index < list.length; index += 40)
        chunks.push(list.slice(index, index + 40).map((item) => item.id));
      const responses = await Promise.all(
        chunks.map((ids) =>
          client
            .from('project_tasks')
            .select('id,project_id,title,status,priority,planned_end')
            .eq('organization_id', s.org)
            .in('project_id', ids)
            .neq('status', 'cancelled')
            .limit(401),
        ),
      );
      if (
        responses.every(
          (response) => !response.error && (response.data?.length ?? 0) < 401,
        )
      ) {
        const rows = responses.flatMap((response) => response.data ?? []);
        if (rows.length <= 2000) {
          tasks = rows;
          coverage = 'ready';
        } else {
          coverage = 'limited';
        }
      } else {
        coverage = responses.some((response) => response.error)
          ? 'unavailable'
          : 'limited';
      }
    }
  } else if (canTasks) {
    coverage = 'limited';
  }

  const overview = portfolioSnapshot(list, tasks, today);
  const accountEmail = user.email ?? '';
  const actions = [
    ...(canTasks
      ? [
          {
            label: canExecution ? 'Task Board' : 'Task Register',
            href: canExecution
              ? '/dashboard/project-management/tasks'
              : '/dashboard/operations/project_tasks',
            icon: 'calendar' as const,
          },
        ]
      : []),
    ...(canMilestones
      ? [
          {
            label: 'Milestones',
            href: '/dashboard/operations/project_milestones',
            icon: 'calendar' as const,
          },
        ]
      : []),
  ];

  return (
    <OwnerShell
      companyName={org.name}
      accountLabel={accountEmail.split('@')[0] || 'Company member'}
      accountEmail={accountEmail}
      planLabel="Business workspace"
      navigation={ownerWorkspaceNavigation(s.context)}
      currentHref="/dashboard/project-management"
      search=""
      searchPlaceholder="Search projects and tasks..."
      notificationsEnabled={has('notification.view')}
      dashboardBrand
    >
      <main id="main-content" className="pm-page" tabIndex={-1}>
        <div className="pm-breadcrumb">
          <Link href="/dashboard">Business OS</Link>
          <span>/</span>
          <strong>Projects &amp; Portfolio</strong>
        </div>
        <header className="pm-hero">
          <div>
            <span className="pm-hero-kicker">CONSTRUCTION & DELIVERY</span>
            <h1>Projects &amp; Portfolio</h1>
            <p>
              Manage project records, portfolio status, progress, tasks and
              milestones. Run site execution and operational workflows in
              Construction ERP.
            </p>
          </div>
          <div className="pm-hero-buttons">
            <Link href="/dashboard/projects" className="pm-hero-secondary">
              All projects
            </Link>
            {canCreateProject && (
              <Link href="/dashboard/projects" className="pm-hero-primary">
                <OwnerIcon name="plus" size={17} /> New project
              </Link>
            )}
          </div>
        </header>

        <section className="pm-metrics" aria-label="Project portfolio summary">
          {[
            {
              label: 'Accessible projects',
              value: overview.total,
              detail: 'Current portfolio',
              tone: 'neutral',
            },
            {
              label: 'Ongoing',
              value: overview.ongoing,
              detail: 'Active delivery work',
              tone: 'blue',
            },
            {
              label: 'Completed',
              value: overview.completed,
              detail: 'Completed or handed over',
              tone: 'green',
            },
            {
              label: 'Physical progress',
              value:
                overview.averageProgress === null
                  ? '—'
                  : overview.averageProgress + '%',
              detail: overview.tracked + ' projects with tracked tasks',
              tone: 'amber',
            },
          ].map((metric) => (
            <article
              className={'pm-metric is-' + metric.tone}
              key={metric.label}
            >
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <small>{metric.detail}</small>
            </article>
          ))}
        </section>
        {list.length >= 250 && (
          <p role="status" className="pm-note">
            This view lists the latest 250 accessible projects. Portfolio totals
            are limited to those records; use the project directory for your
            workflow.
          </p>
        )}

        <section
          className="pm-work-layout"
          aria-label="Project work and navigation"
        >
          <div className="pm-panel pm-attention">
            <div className="pm-panel-heading">
              <div>
                <span className="pm-eyebrow">SITE DELIVERY SIGNALS</span>
                <h2>Needs attention</h2>
                <p>
                  Based on actual authorized Operations tasks, not guessed
                  milestones.
                </p>
              </div>
              {canTasks && (
                <Link
                  className="pm-text-link"
                  href={
                    canExecution
                      ? '/dashboard/project-management/tasks'
                      : '/dashboard/operations/project_tasks'
                  }
                >
                  {canExecution ? 'Task Board' : 'Task register'} →
                </Link>
              )}
            </div>
            {coverage === 'ready' && overview.alerts ? (
              <>
                <div className="pm-alert-stats">
                  <div>
                    <strong>{overview.blocked}</strong>
                    <span>Blocked</span>
                  </div>
                  <div>
                    <strong>{overview.overdue}</strong>
                    <span>Overdue</span>
                  </div>
                  <div>
                    <strong>{overview.dueSoon}</strong>
                    <span>Due in 7 days</span>
                  </div>
                </div>
                {overview.alerts.length ? (
                  <ul className="pm-task-list">
                    {overview.alerts.slice(0, 6).map((task) => {
                      const project = list.find(
                        (item) => item.id === task.project_id,
                      );
                      return (
                        <li key={task.id}>
                          <Link
                            href={
                              '/dashboard/operations/project_tasks/' + task.id
                            }
                          >
                            <span className={'pm-alert-dot is-' + task.kind} />
                            <span>
                              <strong>{task.title}</strong>
                              <small>
                                {project?.name ?? 'Project'} ·{' '}
                                {task.kind.replaceAll('_', ' ')}
                                {task.planned_end
                                  ? ' · ' + task.planned_end
                                  : ''}
                              </small>
                            </span>
                            <OwnerIcon name="arrow" size={15} />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="pm-empty-inline">
                    No blocked or upcoming tasks in the tracked work.
                  </p>
                )}
              </>
            ) : (
              <p className="pm-empty-inline">
                {coverage === 'restricted'
                  ? 'Task indicators are restricted to team members with task-view permission.'
                  : coverage === 'limited'
                    ? 'There are more records than this portfolio snapshot can verify. Open the task register for accurate details.'
                    : 'Task signals are temporarily unavailable. Open the task register to review live work.'}
              </p>
            )}
          </div>
          <div className="pm-panel pm-shortcuts">
            <div className="pm-panel-heading">
              <div>
                <span className="pm-eyebrow">PROJECT PLANNING</span>
                <h2>Tasks &amp; milestones</h2>
                <p>Plan and track work against your project records.</p>
              </div>
            </div>
            <div className="pm-shortcut-grid">
              {actions.map((action) => (
                <Link href={action.href} key={action.href}>
                  <span>
                    <OwnerIcon name={action.icon} size={18} />
                  </span>
                  <strong>{action.label}</strong>
                  <OwnerIcon name="arrow" size={15} />
                </Link>
              ))}
              {!actions.length && (
                <p className="pm-empty-inline">
                  Project-level tools depend on your role permissions.
                </p>
              )}
            </div>
          </div>
        </section>
        <PortfolioBoard
          projects={list}
          attention={coverage === 'ready' ? overview.byProject : null}
          canExecution={canExecution}
          canTasks={canTasks}
        />
      </main>
    </OwnerShell>
  );
}
