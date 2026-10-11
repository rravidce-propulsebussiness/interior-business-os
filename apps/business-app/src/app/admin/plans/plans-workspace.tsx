'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useMemo, useState } from 'react';
import { OsIcon } from '../dashboard-shell';
import { createSubscriptionPlan } from './actions';

type Plan = {
  id: string;
  key: string;
  name: string;
  status: string;
  moduleIds: string[];
};
type Module = { id: string; key: string; name: string; status: string };

const accents = [
  {
    icon: '✦',
    avatar: 'bg-emerald-50 text-emerald-600',
    button: 'border-blue-200 bg-white text-blue-700',
  },
  {
    icon: '▥',
    avatar: 'bg-violet-50 text-violet-600',
    button: 'border-blue-200 bg-white text-blue-700',
  },
  {
    icon: '♛',
    avatar: 'bg-amber-50 text-amber-600',
    button: 'border-blue-600 bg-blue-600 text-white',
  },
] as const;

function formatPlanKey(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+$/g, '')
    .slice(0, 60);
}

function CreatePlanDialog({
  modules,
  onClose,
}: {
  modules: Module[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [state, submit, pending] = useActionState(createSubscriptionPlan, {
    message: '',
  });
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [manualKey, setManualKey] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const available = modules.filter((module) => module.status === 'active');

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onEscape);
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onEscape);
      document.body.style.overflow = oldOverflow;
    };
  }, [onClose]);

  useEffect(() => {
    if (state.created) router.refresh();
  }, [router, state.created]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 px-3 py-5 backdrop-blur-sm sm:px-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-plan-title"
        className="os-plans-dialog flex w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-5 sm:px-7">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-blue-600">
              Membership configuration
            </p>
            <h2
              id="create-plan-title"
              className="mt-1 text-xl font-extrabold text-slate-950 sm:text-2xl"
            >
              {state.created ? 'Plan created' : 'Create a new plan'}
            </h2>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              {state.created
                ? 'The new membership bundle is ready for organization assignment.'
                : 'Name your plan and select its included modules. Existing organizations are not changed.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-9 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
            aria-label="Close create plan dialog"
          >
            <OsIcon name="close" size={17} />
          </button>
        </header>
        {state.created ? (
          <div className="space-y-5 p-7">
            <div className="grid size-12 place-items-center rounded-2xl bg-emerald-100 text-2xl text-emerald-700">
              ✓
            </div>
            <p role="status" className="text-sm leading-6 text-slate-700">
              {state.message}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700"
            >
              Back to membership plans
            </button>
          </div>
        ) : (
          <form action={submit} className="flex min-h-0 flex-col">
            <div className="max-h-[min(68vh,650px)] space-y-5 overflow-y-auto px-5 py-6 sm:px-7">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-2 text-xs font-bold text-slate-700">
                  Display name <span className="text-red-500">*</span>
                  <input
                    autoFocus
                    required
                    name="name"
                    value={name}
                    minLength={3}
                    maxLength={100}
                    onChange={(event) => {
                      const next = event.target.value;
                      setName(next);
                      if (!manualKey) setKey(formatPlanKey(next));
                    }}
                    placeholder="e.g. Construction Plus"
                    className="os-plans-input w-full rounded-xl px-4 py-3 text-sm font-medium"
                  />
                </label>
                <label className="block space-y-2 text-xs font-bold text-slate-700">
                  Plan identifier <span className="text-red-500">*</span>
                  <input
                    required
                    name="key"
                    value={key}
                    pattern="[a-z][a-z0-9_]*"
                    minLength={3}
                    maxLength={60}
                    onChange={(event) => {
                      const next = formatPlanKey(event.target.value);
                      setKey(next);
                      setManualKey(next.length > 0);
                    }}
                    placeholder="construction_plus"
                    className="os-plans-input w-full rounded-xl px-4 py-3 text-sm font-medium"
                  />
                  <span className="block text-[11px] font-normal text-slate-500">
                    {manualKey
                      ? 'Custom key · clear to resume automatic naming'
                      : 'Generated from plan name · editable'}
                  </span>
                </label>
              </div>
              <fieldset>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <legend className="text-sm font-extrabold text-slate-900">
                    Included modules <span className="text-red-500">*</span>
                  </legend>
                  <span className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700">
                    {selected.length} selected
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Select one or more active modules to include in this plan.
                </p>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {available.map((module) => (
                    <label
                      key={module.id}
                      className={
                        'flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 text-xs font-semibold transition ' +
                        (selected.includes(module.key)
                          ? 'border-blue-400 bg-blue-50 text-blue-800'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-blue-200')
                      }
                    >
                      <input
                        name="modules"
                        type="checkbox"
                        value={module.key}
                        checked={selected.includes(module.key)}
                        onChange={(event) =>
                          setSelected((current) =>
                            event.target.checked
                              ? [...current, module.key]
                              : current.filter((value) => value !== module.key),
                          )
                        }
                        className="os-plans-checkbox"
                      />
                      {module.name}
                    </label>
                  ))}
                </div>
                {available.length === 0 && (
                  <p className="mt-4 rounded-xl bg-amber-50 p-4 text-xs text-amber-800">
                    No active modules are configured. A plan cannot be created
                    yet.
                  </p>
                )}
              </fieldset>
              {state.message && (
                <p
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800"
                >
                  {state.message}
                </p>
              )}
            </div>
            <footer className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50 px-5 py-4 sm:px-7">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  pending ||
                  name.trim().length < 3 ||
                  !/^[a-z][a-z0-9_]{2,59}$/.test(key) ||
                  selected.length === 0
                }
                className="rounded-xl bg-blue-600 px-5 py-3 text-xs font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending ? 'Creating plan…' : 'Create membership plan →'}
              </button>
            </footer>
          </form>
        )}
      </section>
    </div>
  );
}

export function PlansWorkspace({
  plans,
  modules,
  usageByPlan,
  canCreate,
}: {
  plans: Plan[];
  modules: Module[];
  usageByPlan: Record<string, number | null>;
  canCreate: boolean;
}) {
  const ordered = useMemo(
    () =>
      [...plans].sort(
        (a, b) =>
          a.moduleIds.length - b.moduleIds.length ||
          a.name.localeCompare(b.name),
      ),
    [plans],
  );
  const available = useMemo(
    () => modules.filter((module) => module.status === 'active'),
    [modules],
  );
  const mostComplete = ordered.reduce(
    (best, plan) =>
      !best || plan.moduleIds.length > best.moduleIds.length ? plan : best,
    null as Plan | null,
  );
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const filteredModules = available.filter((module) =>
    module.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const active = ordered.filter((plan) => plan.status === 'active');
  const assignmentKnown = ordered.every((plan) => usageByPlan[plan.id] != null);
  const assignedTotal = assignmentKnown
    ? ordered.reduce((total, plan) => total + (usageByPlan[plan.id] ?? 0), 0)
    : null;

  const openComparison = (id: string) => {
    setHighlightedId(id);
    document.getElementById('plan-comparison')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="os-plans min-h-screen bg-[#f7f9fd] px-3 py-5 text-slate-950 sm:px-5 sm:py-7 xl:px-8"
    >
      <div className="mx-auto max-w-[1500px] space-y-5 sm:space-y-6">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-2 text-xs font-medium text-slate-500"
        >
          <Link href="/admin" className="hover:text-blue-600">
            Dashboard
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-slate-800">Membership Plans</span>
        </nav>
        <header className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
              Membership Plans
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Build and manage subscription access across ProPulse Business OS.
            </p>
          </div>
          {canCreate && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-100 hover:bg-blue-700 sm:w-auto"
            >
              <span aria-hidden="true" className="text-lg">
                ＋
              </span>{' '}
              Create new plan
            </button>
          )}
        </header>

        <section
          aria-label="Subscription overview"
          className="grid gap-3 sm:grid-cols-3"
        >
          {[
            {
              label: 'Active plans',
              value: active.length,
              note: 'Currently available bundles',
              tone: 'bg-blue-50 text-blue-600',
              icon: '▱',
            },
            {
              label: 'Available modules',
              value: available.length,
              note: 'Active platform modules',
              tone: 'bg-violet-50 text-violet-600',
              icon: '▦',
            },
            {
              label: 'Organizations assigned',
              value: assignedTotal,
              note: assignmentKnown
                ? 'Current non-archived organizations'
                : 'Organization counts unavailable',
              tone: 'bg-emerald-50 text-emerald-600',
              icon: '♙',
            },
          ].map((stat) => (
            <article
              key={stat.label}
              className="flex min-w-0 items-center gap-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm shadow-slate-200/50 sm:p-5"
            >
              <div
                className={
                  'grid size-14 shrink-0 place-items-center rounded-2xl text-2xl font-extrabold ' +
                  stat.tone
                }
              >
                {stat.icon}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-600">
                  {stat.label}
                </p>
                <p className="mt-1 text-3xl font-extrabold leading-none text-slate-950">
                  {stat.value ?? '—'}
                </p>
                <p className="mt-2 text-[11px] leading-4 text-slate-500">
                  {stat.note}
                </p>
              </div>
            </article>
          ))}
        </section>

        <section
          aria-label="Membership plan cards"
          className="grid gap-4 lg:grid-cols-3"
        >
          {ordered.map((plan, index) => {
            const included = available.filter((module) =>
              plan.moduleIds.includes(module.id),
            );
            const tone = accents[Math.min(index, accents.length - 1)]!;
            const featured = mostComplete?.id === plan.id && ordered.length > 1;
            const usage = usageByPlan[plan.id];
            return (
              <article
                key={plan.id}
                className={
                  'flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-white p-5 shadow-sm transition-shadow hover:shadow-md sm:p-6 ' +
                  (featured
                    ? 'border-blue-400 bg-gradient-to-b from-blue-50/60 to-white'
                    : 'border-slate-200')
                }
              >
                <div className="flex items-start gap-3">
                  <div
                    className={
                      'grid size-12 shrink-0 place-items-center rounded-2xl text-2xl ' +
                      tone.avatar
                    }
                  >
                    {tone.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-extrabold tracking-tight text-slate-950">
                        {plan.name}
                      </h2>
                      <span
                        className={
                          'rounded-full px-2.5 py-1 text-[10px] font-bold capitalize ' +
                          (plan.status === 'active'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-600')
                        }
                      >
                        {plan.status}
                      </span>
                    </div>
                    <p className="mt-1 break-all text-xs text-slate-500">
                      {plan.key}
                    </p>
                  </div>
                  {featured && (
                    <span className="shrink-0 rounded-full bg-blue-100 px-2.5 py-1 text-[10px] font-bold text-blue-700">
                      Most complete
                    </span>
                  )}
                </div>

                <div className="mt-5 flex items-center gap-2 border-t border-slate-100 pt-4">
                  <span className="text-blue-600">
                    <OsIcon name="dashboard" size={18} />
                  </span>
                  <p className="text-sm font-extrabold text-slate-900">
                    {included.length}{' '}
                    {included.length === 1 ? 'module' : 'modules'}
                  </p>
                </div>
                <p className="mt-2 min-h-9 text-xs leading-5 text-slate-500">
                  {included.map((module) => module.name).join(', ') ||
                    'No active modules included'}
                </p>
                <ul
                  className="mt-4 grid flex-1 grid-cols-2 content-start gap-x-2 gap-y-3"
                  aria-label={plan.name + ' modules'}
                >
                  {included.map((module) => (
                    <li
                      key={module.id}
                      className="flex min-w-0 items-center gap-2 text-xs text-slate-700"
                    >
                      <span
                        className="grid size-4 shrink-0 place-items-center rounded-full bg-blue-600 text-[10px] text-white"
                        aria-hidden="true"
                      >
                        ✓
                      </span>
                      <span className="break-words">{module.name}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                  <div className="flex items-center gap-2 text-slate-600">
                    <OsIcon name="users" size={18} />
                    <div>
                      <p className="text-xs font-extrabold text-slate-900">
                        {usage === null || usage === undefined
                          ? 'Count unavailable'
                          : usage +
                            ' ' +
                            (usage === 1 ? 'organization' : 'organizations')}
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-500">
                        Using this plan
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openComparison(plan.id)}
                    className={
                      'inline-flex items-center justify-center gap-1.5 rounded-xl border px-3.5 py-2.5 text-xs font-bold transition hover:brightness-95 ' +
                      tone.button
                    }
                  >
                    View modules <OsIcon name="arrow" size={14} />
                  </button>
                </div>
              </article>
            );
          })}
          {ordered.length === 0 && (
            <div className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
              <h2 className="text-lg font-bold">No membership plans yet</h2>
              <p className="mt-2 text-sm text-slate-500">
                Create your first plan using the available modules.
              </p>
            </div>
          )}
        </section>

        <section
          id="plan-comparison"
          aria-label="Module comparison"
          className="scroll-mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/50 sm:p-6"
        >
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-xl bg-blue-50 text-blue-600">
                <OsIcon name="dashboard" size={22} />
              </span>
              <div>
                <h2 className="text-lg font-extrabold text-slate-950">
                  Module comparison
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  See which platform modules each membership includes.
                </p>
              </div>
            </div>
            <label className="relative block w-full max-w-xs">
              <span className="sr-only">Search comparison modules</span>
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <OsIcon name="search" size={17} />
              </span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search modules..."
                type="search"
                className="os-plans-input w-full rounded-xl py-2.5 pl-10 pr-3 text-xs"
              />
            </label>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[560px] border-collapse text-xs">
              <thead className="bg-slate-50">
                <tr>
                  <th
                    scope="col"
                    className="min-w-[170px] border-b border-slate-200 px-4 py-3 text-left font-extrabold text-slate-700"
                  >
                    Module
                  </th>
                  {ordered.map((plan) => (
                    <th
                      scope="col"
                      key={plan.id}
                      className={
                        'min-w-[115px] border-b border-l border-slate-200 px-3 py-3 text-center ' +
                        (highlightedId === plan.id ? 'bg-blue-50' : '')
                      }
                    >
                      <span className="block font-extrabold text-slate-950">
                        {plan.name}
                      </span>
                      <span className="mt-1 block text-[10px] font-medium text-slate-500">
                        {plan.moduleIds.length} modules
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredModules.map((module) => (
                  <tr key={module.id} className="hover:bg-slate-50/80">
                    <th
                      scope="row"
                      className="border-b border-slate-100 px-4 py-3 text-left font-semibold text-slate-700"
                    >
                      {module.name}
                    </th>
                    {ordered.map((plan) => {
                      const included = plan.moduleIds.includes(module.id);
                      return (
                        <td
                          key={plan.id}
                          className={
                            'border-b border-l border-slate-100 px-3 py-3 text-center ' +
                            (highlightedId === plan.id ? 'bg-blue-50/60' : '')
                          }
                        >
                          {included ? (
                            <span
                              className="inline-grid size-5 place-items-center rounded-full bg-blue-600 text-[11px] font-bold text-white"
                              aria-label="Included"
                            >
                              ✓
                            </span>
                          ) : (
                            <span
                              aria-label="Not included"
                              className="font-bold text-slate-300"
                            >
                              —
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {filteredModules.length === 0 && (
                  <tr>
                    <td
                      colSpan={ordered.length + 1}
                      className="px-5 py-10 text-center text-slate-500"
                    >
                      No modules match your search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-[11px] leading-5 text-slate-500">
            Module availability is governed by each organization’s selected plan
            and entitlement overrides. Existing memberships are never changed
            when you create a new plan.
          </p>
        </section>
      </div>
      {createOpen && (
        <CreatePlanDialog
          modules={modules}
          onClose={() => setCreateOpen(false)}
        />
      )}
    </main>
  );
}
