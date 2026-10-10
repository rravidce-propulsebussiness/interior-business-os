import Link from 'next/link';
import { pageServices } from '@business-os/auth/server';
import { ActionForm } from '@business-os/ui/action-form';
import { submitCompanyApplication } from './actions';

type ApplicationSummary = {
  id: string;
  company_name: string;
  slug: string;
  status: string;
  decision_note?: string | null;
  submitted_at: string;
};

function isSummary(value: unknown): value is ApplicationSummary {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'company_name' in value &&
    typeof value.company_name === 'string' &&
    'slug' in value &&
    typeof value.slug === 'string' &&
    'status' in value &&
    typeof value.status === 'string' &&
    'submitted_at' in value &&
    typeof value.submitted_at === 'string'
  );
}

export default async function CompanyApplicationPage() {
  const { authorization, repository } = await pageServices();
  await authorization.requireAuthenticatedUser();
  const [industries, plans, history] = await Promise.all([
    repository.industries(),
    repository.plans(),
    repository.myCompanyApplications(),
  ]);
  const applications = Array.isArray(history) ? history.filter(isSummary) : [];

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="min-h-screen bg-slate-50 px-5 py-10 text-slate-900 sm:px-8"
    >
      <div className="mx-auto max-w-4xl space-y-8">
        <Link
          href="/dashboard"
          className="text-sm font-medium text-slate-600 hover:underline"
        >
          ← Business dashboard
        </Link>
        <header className="rounded-3xl bg-slate-950 p-8 text-white sm:p-10">
          <p className="text-xs font-bold tracking-[0.2em] text-sky-300 uppercase">
            Company onboarding
          </p>
          <h1 className="mt-3 text-3xl font-semibold">
            Register your business
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
            Apply with your verified account. A Platform Administrator reviews
            each new business before its workspace and owner access are
            provisioned.
          </p>
        </header>
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-xl font-semibold">Business details</h2>
          <ActionForm
            action={submitCompanyApplication}
            label="Submit for review"
          >
            <label className="grid gap-2 text-sm font-medium">
              Company name
              <input
                name="name"
                required
                maxLength={200}
                placeholder="Your registered business name"
                className="rounded-lg border border-slate-300 px-4 py-3"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Workspace slug
              <input
                name="slug"
                required
                maxLength={80}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                placeholder="my-company"
                className="rounded-lg border border-slate-300 px-4 py-3"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Legal name (optional)
              <input
                name="legalName"
                maxLength={200}
                className="rounded-lg border border-slate-300 px-4 py-3"
              />
            </label>
            <fieldset className="rounded-xl border border-slate-200 p-4">
              <legend className="px-2 text-sm font-semibold">
                Industries (choose one or more)
              </legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {industries.map((industry) => (
                  <label
                    key={industry.id}
                    className="flex items-center gap-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      name="industries"
                      value={industry.key}
                      className="h-4 w-4 accent-slate-900"
                    />
                    {industry.name}
                  </label>
                ))}
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Construction and Interior Design use the same CRM, quotation,
                billing and project modules.
              </p>
            </fieldset>
            <label className="grid gap-2 text-sm font-medium">
              Requested subscription
              <select
                name="planId"
                defaultValue=""
                className="rounded-lg border border-slate-300 px-4 py-3"
              >
                <option value="">Administrator-recommended plan</option>
                {plans
                  .filter((plan) => plan.status === 'active')
                  .map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name}
                    </option>
                  ))}
              </select>
            </label>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="grid gap-2 text-sm font-medium">
                Country code
                <input
                  name="country"
                  required
                  defaultValue="IN"
                  maxLength={2}
                  minLength={2}
                  className="rounded-lg border border-slate-300 px-3 py-3"
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Currency
                <input
                  name="currency"
                  required
                  defaultValue="INR"
                  maxLength={3}
                  minLength={3}
                  className="rounded-lg border border-slate-300 px-3 py-3"
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Timezone
                <input
                  name="timezone"
                  required
                  defaultValue="Asia/Kolkata"
                  className="rounded-lg border border-slate-300 px-3 py-3"
                />
              </label>
            </div>
          </ActionForm>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
          <h2 className="text-xl font-semibold">Your applications</h2>
          {applications.length ? (
            <ul className="mt-5 divide-y divide-slate-200">
              {applications.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-start justify-between gap-3 py-4"
                >
                  <div>
                    <p className="font-semibold">{item.company_name}</p>
                    <p className="text-sm text-slate-600">{item.slug}</p>
                    {item.decision_note && (
                      <p className="mt-2 text-sm">{item.decision_note}</p>
                    )}
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold capitalize">
                    {item.status.replace(/_/g, ' ')}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-slate-600">
              No submitted applications yet.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
