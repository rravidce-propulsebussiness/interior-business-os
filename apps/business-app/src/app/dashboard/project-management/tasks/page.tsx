import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { canAccess } from '@business-os/auth';
import { OwnerShell } from '../../owner-shell';
import { ownerWorkspaceNavigation } from '../../owner-workspace-navigation';
import { operationsServices } from '../../operations/service';
import '../../owner-dashboard.css';
import '../project-management.css';

export const dynamic = 'force-dynamic';
const lanes = [
  { status: 'todo', title: 'To do', theme: 'bg-slate-50' },
  { status: 'in_progress', title: 'In progress', theme: 'bg-blue-50' },
  { status: 'blocked', title: 'Blocked', theme: 'bg-rose-50' },
  { status: 'done', title: 'Completed', theme: 'bg-emerald-50' },
  { status: 'cancelled', title: 'Cancelled', theme: 'bg-slate-100' },
];
const text = (value: unknown) =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : '';
const asPage = (value: string | undefined) =>
  Math.min(10000, Math.max(1, Math.floor(Number(value)) || 1));

export default async function ProjectTasksPage({
  searchParams,
}: {
  searchParams: Promise<{
    project?: string;
    query?: string;
    projectPage?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const s = await operationsServices('task.view', true);
  if (!s.allowed('execution.view')) notFound();
  const query = (params.query ?? '').trim().slice(0, 100);
  const projectPage = asPage(params.projectPage);
  const page = asPage(params.page);
  const project = z.uuid().safeParse(params.project).success
    ? params.project!
    : '';
  const [org, user, options] = await Promise.all([
    s.repository.organization(s.context.organizationId),
    s.authorization.requireAuthenticatedUser(),
    s.operations.options('projects', undefined, query, projectPage),
  ]);
  if (!org) throw new Error('Company workspace unavailable');
  const tasks = project
    ? await s.operations.search('project_tasks', { project_id: project }, page)
    : null;
  const rows = tasks?.rows ?? [];
  const selected = options.rows.find((item) => item.id === project);
  const canManage = s.allowed('task.manage');
  const notificationAccess = canAccess(s.context, {
    organizationId: s.context.organizationId,
    permission: 'notification.view',
  });
  const email = user.email ?? '';
  const url = (parts: Record<string, string>) =>
    '/dashboard/project-management/tasks?' +
    new URLSearchParams({
      project,
      query,
      projectPage: String(projectPage),
      ...parts,
    }).toString();

  return (
    <OwnerShell
      companyName={org.name}
      accountLabel={email.split('@')[0] || 'Company member'}
      accountEmail={email}
      planLabel="Business workspace"
      navigation={ownerWorkspaceNavigation(s.context)}
      search=""
      currentHref="/dashboard/project-management/tasks"
      notificationsEnabled={notificationAccess}
    >
      <main id="main-content" tabIndex={-1} className="pm-page">
        <nav aria-label="Breadcrumb" className="pm-breadcrumb">
          <Link href="/dashboard/project-management">
            Projects &amp; Portfolio
          </Link>
          <span>/</span>
          <strong>Task Board</strong>
        </nav>
        <header className="pm-hero">
          <div>
            <span className="pm-hero-kicker">PROJECT DELIVERY</span>
            <h1>Task Board</h1>
            <p>
              Plan and review authorized site tasks using the existing
              Operations records.
            </p>
          </div>
          <div className="pm-hero-buttons">
            <Link
              href="/dashboard/project-management"
              className="pm-hero-secondary"
            >
              Portfolio
            </Link>
            {project && canManage && (
              <Link
                href={
                  '/dashboard/operations/command/save_project_tasks?project=' +
                  encodeURIComponent(project)
                }
                className="pm-hero-primary"
              >
                Add task
              </Link>
            )}
          </div>
        </header>
        <section className="pm-panel my-5" aria-label="Choose project">
          <div className="flex flex-wrap items-end gap-4">
            <form
              className="flex min-w-[240px] flex-1 flex-wrap items-end gap-3"
              method="get"
            >
              <label className="grid min-w-[180px] flex-1 gap-2 text-xs font-semibold">
                Project
                <select
                  className="min-h-11 rounded-lg border bg-white px-3"
                  name="project"
                  defaultValue={project}
                  required
                >
                  <option value="">Select a project</option>
                  {project && !selected && (
                    <option value={project}>Selected project</option>
                  )}
                  {options.rows.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="min-h-11 rounded-lg bg-[#88352b] px-4 text-xs font-bold text-white"
                type="submit"
              >
                Open
              </button>
            </form>
            <form
              className="flex min-w-[220px] flex-1 flex-wrap items-end gap-3"
              method="get"
            >
              {project && (
                <input type="hidden" name="project" value={project} />
              )}
              <label className="grid min-w-[180px] flex-1 gap-2 text-xs font-semibold">
                Find another project
                <input
                  className="min-h-11 rounded-lg border bg-white px-3"
                  name="query"
                  type="search"
                  maxLength={100}
                  defaultValue={query}
                  placeholder="Search project names"
                />
              </label>
              <button
                className="min-h-11 rounded-lg border px-4 text-xs font-bold"
                type="submit"
              >
                Search
              </button>
            </form>
          </div>
          <nav
            className="mt-4 flex gap-4 text-xs font-bold text-[#88352b]"
            aria-label="Project picker pagination"
          >
            {projectPage > 1 && (
              <Link
                href={url({ projectPage: String(projectPage - 1), page: '1' })}
              >
                Previous projects
              </Link>
            )}
            {options.has_more && (
              <Link
                href={url({ projectPage: String(projectPage + 1), page: '1' })}
              >
                More projects
              </Link>
            )}
          </nav>
        </section>
        {!project ? (
          <section className="pm-panel py-16 text-center">
            <h2 className="text-xl font-bold">
              Select a project to manage tasks
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Task status, due dates and progress come from your canonical
              execution plan.
            </p>
          </section>
        ) : (
          <>
            <div className="my-4 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-extrabold">
                  {selected?.label ?? 'Selected project'} · Tasks
                </h2>
                <p className="text-xs text-slate-500">
                  {tasks?.total ?? 0} authorized tasks · Page {tasks?.page ?? 1}
                </p>
              </div>
              <div className="flex gap-4 text-xs font-bold text-[#88352b]">
                <Link href={'/dashboard/projects/' + project}>
                  Project details
                </Link>
                <Link
                  href={
                    '/dashboard/operations/project_tasks?project=' +
                    encodeURIComponent(project)
                  }
                >
                  Full task register
                </Link>
              </div>
            </div>
            <p className="pm-note">
              The lanes below show only this page of tasks, not total workflow
              counts. Open a task to change status, assignment or completion
              through existing permission-checked actions.
            </p>
            <section
              aria-label="Kanban task status"
              className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5"
            >
              {lanes.map((lane) => {
                const items = rows.filter((row) => row.status === lane.status);
                return (
                  <div
                    key={lane.status}
                    className={'min-w-0 rounded-xl border p-3 ' + lane.theme}
                  >
                    <h3 className="mb-3 flex items-center justify-between text-sm font-bold">
                      {lane.title}{' '}
                      <span className="rounded-full bg-white px-2 py-1 text-xs">
                        {items.length}
                      </span>
                    </h3>
                    <div className="grid content-start gap-2">
                      {items.map((task) => (
                        <Link
                          key={text(task.id)}
                          href={
                            '/dashboard/operations/project_tasks/' +
                            encodeURIComponent(text(task.id))
                          }
                          className="grid gap-2 rounded-xl border bg-white p-3 shadow-sm transition hover:border-orange-300"
                        >
                          <strong className="break-words text-xs">
                            {text(task.title) || 'Untitled task'}
                          </strong>
                          <span className="text-[11px] capitalize text-[#88352b]">
                            {text(task.priority) || 'Normal'} priority
                          </span>
                          <small className="text-[11px] text-slate-500">
                            {task.planned_end
                              ? 'Due ' + text(task.planned_end)
                              : 'No due date'}{' '}
                            · {text(task.completion_percentage) || '0'}%
                            complete
                          </small>
                        </Link>
                      ))}
                      {!items.length && (
                        <p className="p-4 text-center text-xs text-slate-400">
                          No tasks on this page
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </section>
            <nav
              className="mt-5 flex flex-wrap justify-between gap-3 text-xs font-bold text-[#88352b]"
              aria-label="Task pages"
            >
              {tasks && tasks.page > 1 ? (
                <Link href={url({ page: String(tasks.page - 1) })}>
                  Previous tasks
                </Link>
              ) : (
                <span />
              )}
              <span>
                Page {tasks?.page ?? 1} · {tasks?.total ?? 0} records
              </span>
              {tasks && tasks.page * 25 < tasks.total ? (
                <Link href={url({ page: String(tasks.page + 1) })}>
                  Next tasks
                </Link>
              ) : (
                <span />
              )}
            </nav>
          </>
        )}
      </main>
    </OwnerShell>
  );
}
