import Link from 'next/link';
import { automationServices } from '../service';
import { ConfigurationForm } from './forms';
import { canAccess } from '@business-os/auth';
export default async function AutomationSettingsPage() {
  const s = await automationServices('automation.manage', true),
    [settings, templates] = await Promise.all([
      s.automation.settings(),
      s.automation.read('templates'),
    ]);
  const canConsent = canAccess(s.context, {
    organizationId: s.context.organizationId,
    permission: 'customer.manage',
  });
  const customers = canConsent
    ? ((
        await s.client
          .from('customers')
          .select('id,display_name')
          .eq('organization_id', s.context.organizationId)
          .order('display_name')
          .limit(100)
      ).data ?? [])
    : [];
  const consents = canConsent
    ? ((
        await s.client
          .from('communication_consents')
          .select('customer_id,email_enabled,evidence,version')
          .eq('organization_id', s.context.organizationId)
          .limit(100)
      ).data ?? [])
    : [];
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto max-w-4xl space-y-6 p-6"
    >
      <Link className="underline" href="/dashboard/automations">
        Automations
      </Link>
      <h1 className="text-3xl font-semibold">Automation settings</h1>
      {canConsent && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Customer email consent</h2>
          <p>
            Record explicit consent evidence before enabling customer messages.
            Unchecking consent prevents future delivery claims.
          </p>
          {[
            ...consents,
            { customer_id: '', email_enabled: false, evidence: '', version: 0 },
          ].map((consent) => (
            <ConfigurationForm
              key={consent.customer_id || 'new-consent'}
              section="consent"
              version={consent.version}
            >
              <label className="grid gap-1">
                Customer
                <select
                  name="customer_id"
                  className="rounded border p-2"
                  defaultValue={consent.customer_id}
                  required
                >
                  <option value="">Choose customer</option>
                  {customers
                    .filter(
                      (customer) =>
                        !consent.customer_id ||
                        customer.id === consent.customer_id,
                    )
                    .map((customer) => (
                      <option value={customer.id} key={customer.id}>
                        {customer.display_name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="block">
                <input
                  type="checkbox"
                  name="email_enabled"
                  defaultChecked={consent.email_enabled}
                />{' '}
                Customer explicitly consents to operational email
              </label>
              <label className="grid gap-1">
                Consent evidence
                <textarea
                  name="evidence"
                  className="rounded border p-2"
                  defaultValue={consent.evidence}
                  minLength={3}
                  maxLength={1000}
                  required
                />
              </label>
            </ConfigurationForm>
          ))}
        </section>
      )}
      <ConfigurationForm section="settings" version={settings?.version ?? 0}>
        <h2 className="text-xl font-semibold">Delivery limits</h2>
        {[
          {
            key: 'notification_daily_limit',
            label: 'Daily notifications',
            max: 10000,
            value: settings?.notification_daily_limit ?? 500,
          },
          {
            key: 'email_daily_limit',
            label: 'Daily emails',
            max: 1000,
            value: settings?.email_daily_limit ?? 100,
          },
          {
            key: 'retention_days',
            label: 'Archive notifications after days',
            max: 3650,
            value: settings?.retention_days ?? 365,
          },
        ].map((field) => (
          <label className="grid gap-1" key={field.key}>
            {field.label}
            <input
              className="rounded border p-2"
              name={field.key}
              type="number"
              min={field.key === 'retention_days' ? 30 : 1}
              max={field.max}
              defaultValue={field.value}
              required
            />
          </label>
        ))}
        <label className="block">
          <input
            type="checkbox"
            name="customer_email_enabled"
            defaultChecked={settings?.customer_email_enabled ?? false}
          />{' '}
          Enable consented customer email
        </label>
        <p className="text-sm">
          Customer messages also require recorded customer consent and a
          configured worker email provider. Business and financial history are
          retained.
        </p>
      </ConfigurationForm>
      <h2 className="text-xl font-semibold">Email templates</h2>
      <p>
        Variables:{' '}
        {
          '{{business_name}}, {{entity_number}}, {{project_name}}, {{due_date}}, {{amount_due}}, {{currency}}, {{action_url}}'
        }
        . Messages use plain text.
      </p>
      {[...templates.rows, { key: '', subject: '', body: '', version: 0 }].map(
        (template, index) => (
          <ConfigurationForm
            key={String(template.key) || 'new'}
            section="template"
            version={Number(template.version)}
          >
            <h3 className="font-semibold">
              {template.key ? String(template.key) : 'New template'}
            </h3>
            {['key', 'subject', 'body'].map((field) => (
              <label className="grid gap-1 capitalize" key={field}>
                {field}
                {field === 'body' ? (
                  <textarea
                    className="min-h-32 rounded border p-2"
                    name={field}
                    defaultValue={String(template[field] ?? '')}
                    maxLength={5000}
                    required
                  />
                ) : (
                  <input
                    className="rounded border p-2"
                    name={field}
                    defaultValue={String(template[field] ?? '')}
                    readOnly={field === 'key' && index < templates.rows.length}
                    maxLength={field === 'key' ? 60 : 180}
                    required
                  />
                )}
              </label>
            ))}
          </ConfigurationForm>
        ),
      )}
    </main>
  );
}
