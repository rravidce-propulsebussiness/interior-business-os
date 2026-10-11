'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import {
  createPlatformCompany,
  type CreateCompanyState,
} from './control-actions';

type Industry = { id: string; key: string; name: string };
type Plan = { id: string; name: string; status: string };
type Module = { id: string; key: string; name: string; status: string };

const field =
  'org-owner-input block h-11 w-full min-w-0 rounded-xl border px-3.5 text-sm outline-none transition focus:ring-4 focus:ring-blue-100';

const strongPassword = (value: string) =>
  value.length >= 16 &&
  /[a-z]/.test(value) &&
  /[A-Z]/.test(value) &&
  /[0-9]/.test(value) &&
  /[^a-zA-Z0-9]/.test(value);

function companySlug(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
}

function generatePassword() {
  const alphabet =
    'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#%*-_=!';
  const random = new Uint8Array(32);
  crypto.getRandomValues(random);
  return (
    'Aa7!' +
    Array.from(random, (byte) => alphabet[byte % alphabet.length]).join('')
  );
}

function Tick({ muted = false }: { muted?: boolean }) {
  return (
    <span
      className={
        'inline-grid size-5 place-items-center rounded-md text-xs font-bold ' +
        (muted ? 'bg-slate-100 text-slate-400' : 'bg-blue-600 text-white')
      }
      aria-label={muted ? 'Unavailable' : 'Included in owner role'}
      title={muted ? 'Unavailable' : 'Included in owner role'}
    >
      {muted ? '–' : '✓'}
    </span>
  );
}

export function OwnerOrganizationForm({
  industries,
  plans,
  modules,
}: {
  industries: Industry[];
  plans: Plan[];
  modules: Module[];
}) {
  const [state, action, pending] = useActionState<CreateCompanyState, FormData>(
    createPlatformCompany,
    { message: '' },
  );
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [kind, setKind] = useState<'business' | 'seller'>('business');
  const [chosenIndustries, setChosenIndustries] = useState<string[]>([]);
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const isSeller = kind === 'seller';
  const ready =
    name.trim().length >= 2 &&
    (!isSeller || name.trim().length <= 150) &&
    /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) &&
    chosenIndustries.length > 0 &&
    strongPassword(password);

  if (state.created && state.organizationId) {
    return (
      <section
        className="org-owner-setup mx-auto max-w-3xl rounded-3xl border border-emerald-200 bg-white p-6 shadow-xl shadow-slate-200/60 sm:p-10"
        role="status"
      >
        <div className="grid size-14 place-items-center rounded-2xl bg-emerald-100 text-3xl text-emerald-700">
          ✓
        </div>
        <h2 className="mt-5 text-2xl font-extrabold text-slate-950">
          Organization &amp; owner created
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{state.message}</p>
        {state.ownerProvisioned && (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <h3 className="font-bold text-slate-900">
              One-time temporary password
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Copy now, share through a secure channel, then ask the owner to
              change it using Forgot password. This value is not stored in the
              company database or returned by the server.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-xl bg-white px-4 py-3 text-sm text-slate-900">
                {password}
              </code>
              <button
                type="button"
                className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(password)
                    .then(() => setCopied(true))
                    .catch(() => setCopied(false));
                }}
              >
                {copied ? 'Copied ✓' : 'Copy password'}
              </button>
            </div>
          </div>
        )}
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href={'/admin/organizations/' + state.organizationId}
            className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700"
          >
            Manage organization →
          </Link>
          <Link
            href="/admin/organizations"
            className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700"
          >
            Back to organizations
          </Link>
        </div>
      </section>
    );
  }

  return (
    <form action={action} className="org-owner-setup space-y-5">
      <input type="hidden" name="seller" value={String(isSeller)} />
      <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60 sm:p-7">
          <div className="mb-6 flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-blue-50 text-xl text-blue-600">
              ▦
            </span>
            <div>
              <h2 className="text-lg font-extrabold text-slate-950">
                Business details
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Your organization identity and subscription
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-xs font-semibold text-slate-700">
              Company name <span className="text-red-500">*</span>
              <input
                name="name"
                value={name}
                required
                minLength={2}
                maxLength={200}
                placeholder="e.g. Home Constructions"
                className={field}
                onChange={(event) => {
                  const next = event.target.value;
                  setName(next);
                  if (!slugEdited) setSlug(companySlug(next));
                }}
              />
            </label>
            <label className="space-y-1.5 text-xs font-semibold text-slate-700">
              Company URL slug <span className="text-red-500">*</span>
              <input
                name="slug"
                value={slug}
                required
                maxLength={80}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                placeholder="home-constructions"
                className={field}
                onChange={(event) => {
                  const next = companySlug(event.target.value);
                  setSlug(next);
                  setSlugEdited(next.length > 0);
                }}
              />
              <span className="block text-[11px] font-normal text-blue-600">
                {slugEdited
                  ? 'Custom slug · Clear to resume auto-generation'
                  : '✓ Auto-generated from company name · Editable'}
              </span>
            </label>
          </div>

          <fieldset className="mt-5">
            <legend className="mb-2 text-xs font-bold text-slate-700">
              Organization type <span className="text-red-500">*</span>
            </legend>
            <div className="grid grid-cols-2 gap-2.5">
              {(
                [
                  {
                    value: 'business',
                    label: 'Business owner',
                    description: 'Company workspace',
                    symbol: '◈',
                  },
                  {
                    value: 'seller',
                    label: 'Seller',
                    description: 'Workspace + marketplace',
                    symbol: '▤',
                  },
                ] as const
              ).map((option) => (
                <button
                  type="button"
                  key={option.value}
                  aria-pressed={kind === option.value}
                  onClick={() => setKind(option.value)}
                  className={
                    'flex min-w-0 items-center gap-3 rounded-xl border p-3 text-left transition ' +
                    (kind === option.value
                      ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100'
                      : 'border-slate-200 bg-white hover:border-blue-200')
                  }
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white text-lg text-blue-600">
                    {option.symbol}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-bold text-slate-950">
                      {option.label}
                    </span>
                    <span className="mt-1 block text-[11px] leading-4 text-slate-500">
                      {option.description}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            {isSeller && (
              <p className="mt-3 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-800">
                <strong>Storefront: {name.trim() || 'Company name'}</strong>
                <span className="mt-1 block">
                  Automatically matches the company name. No separate store name
                  to enter.
                </span>
              </p>
            )}
          </fieldset>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-xs font-semibold text-slate-700">
              Subscription plan
              <select name="planId" className={field} defaultValue="">
                <option value="">Platform default</option>
                {plans
                  .filter((plan) => plan.status === 'active')
                  .map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="space-y-1.5 text-xs font-semibold text-slate-700">
              Legal name (optional)
              <input
                name="legalName"
                maxLength={200}
                placeholder="Registered legal name"
                className={field}
              />
            </label>
          </div>

          <fieldset className="mt-5">
            <legend className="text-xs font-bold text-slate-700">
              Industries <span className="text-red-500">*</span>
              <span className="ml-1 font-normal text-slate-500">
                · Select at least one
              </span>
            </legend>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {industries.map((industry) => {
                const selected = chosenIndustries.includes(industry.key);
                return (
                  <button
                    key={industry.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() =>
                      setChosenIndustries((current) =>
                        selected
                          ? current.filter((key) => key !== industry.key)
                          : [...current, industry.key],
                      )
                    }
                    className={
                      'flex min-w-0 items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-xs font-semibold ' +
                      (selected
                        ? 'border-blue-400 bg-blue-50 text-blue-700'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300')
                    }
                  >
                    <span
                      aria-hidden="true"
                      className={
                        'grid size-4 shrink-0 place-items-center rounded-full border text-[10px] ' +
                        (selected
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-slate-300 bg-white')
                      }
                    >
                      {selected ? '✓' : ''}
                    </span>
                    <span className="truncate">{industry.name}</span>
                  </button>
                );
              })}
              {chosenIndustries.map((industry) => (
                <input
                  type="hidden"
                  name="industries"
                  value={industry}
                  key={industry}
                />
              ))}
            </div>
            {industries.length === 0 && (
              <p className="mt-3 text-xs text-amber-700">
                An active industry must be configured before onboarding.
              </p>
            )}
          </fieldset>

          <details className="mt-6 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
            <summary className="cursor-pointer text-xs font-bold text-slate-700">
              Regional settings · India (edit if needed)
            </summary>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <label className="space-y-1 text-[11px] font-semibold text-slate-700">
                Country
                <input
                  name="country"
                  required
                  defaultValue="IN"
                  maxLength={2}
                  pattern="[A-Z]{2}"
                  className={field}
                />
              </label>
              <label className="space-y-1 text-[11px] font-semibold text-slate-700">
                Currency
                <input
                  name="currency"
                  required
                  defaultValue="INR"
                  maxLength={3}
                  pattern="[A-Z]{3}"
                  className={field}
                />
              </label>
              <label className="space-y-1 text-[11px] font-semibold text-slate-700">
                Time zone
                <input
                  name="timezone"
                  required
                  defaultValue="Asia/Kolkata"
                  maxLength={100}
                  className={field}
                />
              </label>
            </div>
          </details>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60 sm:p-7">
          <div className="mb-6 flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-violet-50 text-xl text-violet-600">
              ♙
            </span>
            <div>
              <h2 className="text-lg font-extrabold text-slate-950">
                Owner information
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                One owner login is created alongside the organization
              </p>
            </div>
          </div>
          <div className="space-y-4">
            <label className="block space-y-1.5 text-xs font-semibold text-slate-700">
              Owner full name <span className="text-red-500">*</span>
              <input
                name="ownerName"
                required
                minLength={2}
                maxLength={200}
                placeholder="Full name"
                className={field}
              />
            </label>
            <label className="block space-y-1.5 text-xs font-semibold text-slate-700">
              Owner email <span className="text-red-500">*</span>
              <input
                name="ownerEmail"
                type="email"
                required
                maxLength={254}
                autoComplete="off"
                placeholder="owner@company.com"
                className={field}
              />
            </label>
            <div>
              <label
                htmlFor="owner-temporary-password"
                className="block text-xs font-semibold text-slate-700"
              >
                Temporary owner password <span className="text-red-500">*</span>
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                <input
                  id="owner-temporary-password"
                  name="temporaryPassword"
                  required
                  type={passwordVisible ? 'text' : 'password'}
                  minLength={16}
                  maxLength={128}
                  value={password}
                  autoComplete="new-password"
                  spellCheck={false}
                  placeholder="Generate a secure password"
                  className={field + ' min-w-[150px] flex-1'}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setCopied(false);
                  }}
                />
                <button
                  type="button"
                  aria-pressed={passwordVisible}
                  aria-label={
                    passwordVisible ? 'Hide password' : 'Show password'
                  }
                  onClick={() => setPasswordVisible((value) => !value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700"
                >
                  {passwordVisible ? 'Hide' : 'Show'}
                </button>
              </div>
              <button
                type="button"
                className="mt-2 w-full rounded-xl bg-slate-900 px-4 py-3 text-xs font-bold text-white hover:bg-slate-800"
                onClick={() => {
                  setPassword(generatePassword());
                  setCopied(false);
                }}
              >
                ✦ Generate secure password
              </button>
              <p className="mt-2 text-[11px] leading-5 text-slate-500">
                At least 16 characters with uppercase, lowercase, numbers and
                symbols. Existing verified owners keep their current password.
              </p>
            </div>
          </div>
          <div className="mt-7 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-600 text-lg text-white">
                ✓
              </span>
              <div>
                <p className="text-sm font-bold text-emerald-900">
                  Full owner access by default
                </p>
                <p className="mt-1 text-xs leading-5 text-emerald-800">
                  The owner has full tenant role permissions within subscribed
                  modules. Employees are invited and managed by the owner later.
                  No separate employee accounts or admin roles are created here.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm shadow-slate-200/60">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-7">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-blue-50 text-xl text-blue-600">
              ⚙
            </span>
            <div>
              <h2 className="text-lg font-extrabold text-slate-950">
                Owner access preview
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                All owner actions are included automatically; module
                availability follows the selected plan.
              </p>
            </div>
          </div>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-emerald-800">
            ✓ Owner role · Full access
          </span>
        </div>
        <div className="overflow-x-auto px-5 pb-5 sm:px-7">
          <table className="w-full min-w-[570px] border-separate border-spacing-0 text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-600">
                <th
                  scope="col"
                  className="rounded-l-xl px-4 py-3 text-left font-bold"
                >
                  Module
                </th>
                {['View', 'Create', 'Edit', 'Manage'].map((ability) => (
                  <th
                    scope="col"
                    key={ability}
                    className="px-4 py-3 text-center font-bold"
                  >
                    {ability}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {modules
                .filter((module) => module.status === 'active')
                .map((module) => (
                  <tr key={module.id} className="border-b border-slate-100">
                    <th
                      scope="row"
                      className="border-b border-slate-100 px-4 py-3 text-left font-semibold text-slate-800"
                    >
                      {module.name}
                    </th>
                    {['View', 'Create', 'Edit', 'Manage'].map((ability) => (
                      <td
                        key={ability}
                        className="border-b border-slate-100 px-4 py-3 text-center"
                      >
                        <Tick />
                      </td>
                    ))}
                  </tr>
                ))}
              {modules.filter((module) => module.status === 'active').length ===
                0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    Module list is unavailable; the owner role is still granted
                    using the existing company defaults.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="border-t border-slate-100 bg-slate-50 px-5 py-3 text-[11px] leading-5 text-slate-600 sm:px-7">
          Checkmarks are a role preview, not separate switches. Actual
          operations also require the module entitlement and the permission
          required by that operation. Plan and module access can be managed on
          the company page.
        </p>
      </section>
      {state.message && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
        >
          {state.message}
        </p>
      )}
      <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 px-5 py-4 shadow-xl shadow-slate-300/40 backdrop-blur sm:px-7">
        <div>
          <p className="text-sm font-bold text-slate-900">
            Ready to create this workspace?
          </p>
          <p className="mt-1 text-xs text-slate-500">
            One submission creates the organization, owner and optional seller
            storefront.
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Link
            href="/admin/organizations"
            className="inline-flex flex-1 items-center justify-center rounded-xl border border-slate-200 px-5 py-3 text-xs font-bold text-slate-700 sm:flex-none"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={pending || !ready || industries.length === 0}
            className="flex-1 rounded-xl bg-blue-600 px-6 py-3 text-xs font-bold text-white shadow-lg shadow-blue-200 hover:bg-blue-700 disabled:cursor-not-allowed sm:flex-none"
          >
            {pending
              ? 'Creating organization…'
              : 'Create organization & owner →'}
          </button>
        </div>
      </div>
    </form>
  );
}
