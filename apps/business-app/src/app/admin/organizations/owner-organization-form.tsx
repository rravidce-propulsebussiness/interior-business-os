'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import {
  createPlatformCompany,
  type CreateCompanyState,
} from './control-actions';

const field =
  'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 focus:border-blue-600 focus:outline-blue-600';

function generatePassword() {
  // 36 random bytes, sampled from a 64-character set. The fixed prefix
  // guarantees the server's uppercase/lowercase/number/symbol requirements.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#%*-_=!';
  const bytes = new Uint8Array(36);
  crypto.getRandomValues(bytes);
  return 'Aa7!' + Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

export function OwnerOrganizationForm({
  industries,
  plans,
}: {
  industries: Array<{ id: string; key: string; name: string }>;
  plans: Array<{ id: string; name: string; status: string }>;
}) {
  const [state, action, pending] = useActionState<CreateCompanyState, FormData>(
    createPlatformCompany,
    { message: '' },
  );
  const [password, setPassword] = useState('');
  const [copied, setCopied] = useState(false);
  if (state.created && state.organizationId) {
    return (
      <section className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-950" role="status">
        <h2 className="text-xl font-bold">Organization created</h2>
        <p className="text-sm">{state.message}</p>
        {state.ownerProvisioned && (
          <div className="rounded-xl border border-amber-300 bg-white p-4">
            <p className="text-sm font-bold text-slate-900">Owner temporary password — shown once</p>
            <p className="mt-1 text-xs text-slate-600">Copy this now and share securely with the owner. Do not send it in public chats or unencrypted documents. It will not appear again after leaving this page.</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <code className="max-w-full break-all rounded-lg bg-slate-100 p-3 text-sm text-slate-900">{password}</code>
              <button type="button"
                className="rounded-lg bg-blue-700 px-4 py-2.5 text-xs font-semibold text-white"
                onClick={() => { void navigator.clipboard.writeText(password).then(() => setCopied(true)).catch(() => setCopied(false)); }}>
                {copied ? 'Copied' : 'Copy password'}
              </button>
            </div>
            <p className="mt-3 text-xs font-semibold text-amber-900">
              The owner should change this password using Forgot password as soon as they receive their credentials.
            </p>
          </div>
        )}
        <div className="flex flex-wrap gap-3">
          <Link href={'/admin/organizations/' + state.organizationId}
            className="rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white">Manage new organization →</Link>
          <Link href="/admin/organizations"
            className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold">Back to owners &amp; sellers</Link>
        </div>
      </section>
    );
  }
  return (
    <form action={action} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="grid gap-1.5 text-sm font-medium">
          Company name
          <input required name="name" minLength={2} maxLength={200} placeholder="Example Business Pvt Ltd" className={field}/>
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Company URL slug
          <input required name="slug" maxLength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="example-business" className={field}/>
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Owner full name
          <input required name="ownerName" minLength={2} maxLength={200} placeholder="Name of business owner" className={field}/>
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Owner email
          <input required name="ownerEmail" type="email" maxLength={254} autoComplete="off" placeholder="owner@example.com" className={field}/>
        </label>
        <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">
          Temporary owner password
          <div className="flex flex-wrap gap-2">
            <input required name="temporaryPassword" type="text" minLength={16} maxLength={128}
              value={password} onChange={(e) => { setPassword(e.target.value); setCopied(false); }}
              autoComplete="new-password" spellCheck={false} placeholder="Generate a secure password"
              className={field + ' min-w-[180px] flex-1'}/>
            <button type="button" onClick={() => { setPassword(generatePassword()); setCopied(false); }}
              className="rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white">Generate secure password</button>
          </div>
          <span className="text-xs font-normal text-slate-500">For new owners only. Existing verified accounts keep their current password.</span>
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Legal name (optional)
          <input name="legalName" maxLength={200} className={field}/>
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Plan
          <select name="planId" className={field}>
            <option value="">Platform default</option>
            {plans.filter((p) => p.status==='active').map((p) => <option value={p.id} key={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Country code
          <input name="country" required maxLength={2} defaultValue="IN" className={field}/>
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Currency code
          <input name="currency" required maxLength={3} defaultValue="INR" className={field}/>
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Time zone
          <input name="timezone" required maxLength={100} defaultValue="Asia/Kolkata" className={field}/>
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Storefront name (optional, sellers)
          <input name="storeName" maxLength={150} placeholder="Defaults to company name" className={field}/>
        </label>
      </div>
      <fieldset>
        <legend className="text-sm font-semibold">Industries (select at least one)</legend>
        <div className="mt-3 flex flex-wrap gap-3">
          {industries.map((i) => <label key={i.id}
            className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm">
            <input type="checkbox" name="industries" value={i.key}/>{i.name}
          </label>)}
        </div>
        {industries.length===0 && <p className="mt-2 text-sm text-amber-700">Configure an active industry first.</p>}
      </fieldset>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input name="seller" type="checkbox" value="true"/>
        Also create an approved seller storefront for this organization
      </label>
      {state.message && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{state.message}</p>}
      <button type="submit" disabled={pending || !password || industries.length===0}
        className="rounded-xl bg-blue-700 px-6 py-3 text-sm font-semibold text-white disabled:opacity-50">
        {pending ? 'Creating organization & owner…' : 'Create organization & owner'}
      </button>
    </form>
  );
}
