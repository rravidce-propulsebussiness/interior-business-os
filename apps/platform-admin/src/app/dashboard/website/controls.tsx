'use client';

import { useState, useTransition } from 'react';
import { savePlatformWebsite } from './actions';
import { OsIcon } from '../dashboard-shell';

type PlanConfig = Record<string, number | boolean>;
type WebsitePlan = {
  id: string;
  name: string;
  configuration?: PlanConfig;
};

const features = [
  ['forms', 'Website forms'],
  ['custom_domain', 'Custom domains'],
  ['custom_code', 'Custom frontend code'],
  ['developer_mode', 'Developer mode'],
  ['analytics', 'Website analytics'],
  ['integrations', 'Integrations'],
] as const;

const limits = [
  ['sites', 'Websites per company'],
  ['pages', 'Pages per website'],
  ['storage_bytes', 'Storage allowance (bytes)'],
] as const;

export function WebsitePlatformControls({
  baseDomain,
  managedTls,
  plans,
  allowedEmbeds,
  disabledComponents,
}: {
  baseDomain: string;
  managedTls: boolean;
  plans: WebsitePlan[];
  allowedEmbeds: string[];
  disabledComponents: string[];
}) {
  const [message, setMessage] = useState('');
  const [pending, start] = useTransition();
  const [selectedPlan, setSelectedPlan] = useState(plans[0]?.id ?? '');
  const selectedConfig = plans.find((plan) => plan.id === selectedPlan)?.configuration ?? {};

  return (
    <div className="os-domain-settings">
      <form
        className="os-domain-form"
        aria-label="Domain infrastructure settings"
        action={(form) =>
          start(async () => {
            setMessage('');
            const result = await savePlatformWebsite('settings', {
              baseDomain: String(form.get('baseDomain')),
              managedTls: form.get('tls') === 'on',
              allowedEmbeds: String(form.get('embeds'))
                .split(',')
                .map((host) => host.trim())
                .filter(Boolean),
              disabledComponents: String(form.get('components'))
                .split(',')
                .map((component) => component.trim())
                .filter(Boolean),
            });
            setMessage(result.message);
          })
        }
      >
        <div className="os-domain-form-heading">
          <span className="os-domain-form-icon">
            <OsIcon name="domain" size={21} />
          </span>
          <div>
            <h3>Domain infrastructure settings</h3>
            <p>Configure shared hostname, DNS target and allowed components.</p>
          </div>
        </div>

        <label className="os-domain-field">
          <span>Base hostname</span>
          <input
            name="baseDomain"
            required
            defaultValue={baseDomain}
            placeholder="sites.example.com"
            autoComplete="off"
          />
          <small>Changing this does not rename existing company domains.</small>
        </label>

        <label className="os-domain-toggle-row">
          <span className="os-domain-toggle-copy">
            <strong>Wildcard routing and HTTPS configured</strong>
            <small>Enable only after the hosting provider has configured both.</small>
          </span>
          <input className="os-domain-switch" type="checkbox" name="tls" defaultChecked={managedTls} />
        </label>

        <label className="os-domain-field">
          <span>Allowed embed hostnames</span>
          <input
            name="embeds"
            defaultValue={allowedEmbeds.join(', ')}
            placeholder="youtube.com, maps.google.com"
            autoComplete="off"
          />
          <small>Separate allowed hostnames with commas.</small>
        </label>

        <label className="os-domain-field">
          <span>Disabled component types</span>
          <input
            name="components"
            defaultValue={disabledComponents.join(', ')}
            placeholder="video, iframe"
            autoComplete="off"
          />
          <small>Separate component names with commas.</small>
        </label>

        <div className="os-domain-form-footer">
          <button className="os-domain-save" disabled={pending} type="submit">
            <OsIcon name="check" size={18} />
            {pending ? 'Saving…' : 'Save infrastructure'}
          </button>
        </div>
      </form>

      <form
        className="os-domain-form"
        aria-label="Website plan capabilities"
        action={(form) =>
          start(async () => {
            if (!selectedPlan) return;
            setMessage('');
            const config: PlanConfig = {};
            for (const [key] of limits)
              config[key] = Number(form.get(key));
            for (const [key] of features)
              config[key] = form.get(key) === 'on';
            const result = await savePlatformWebsite('plan', {
              planId: selectedPlan,
              configuration: config,
            });
            setMessage(result.message);
          })
        }
      >
        <div className="os-domain-form-heading">
          <span className="os-domain-form-icon">
            <OsIcon name="crown" size={21} />
          </span>
          <div>
            <h3>Website plan capabilities</h3>
            <p>Set infrastructure quotas and feature eligibility per plan.</p>
          </div>
        </div>

        <label className="os-domain-field">
          <span>Membership plan</span>
          <select
            name="plan"
            value={selectedPlan}
            onChange={(event) => setSelectedPlan(event.target.value)}
            disabled={pending || plans.length === 0}
          >
            {plans.length === 0 && <option value="">No plans available</option>}
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>{plan.name}</option>
            ))}
          </select>
        </label>

        <div className="os-domain-limits">
          {limits.map(([key, label], index) => (
            <label className="os-domain-field" key={key}>
              <span>{label}</span>
              <input
                key={selectedPlan + key}
                name={key}
                type="number"
                min="1"
                step="1"
                required
                disabled={!selectedPlan}
                defaultValue={Number(selectedConfig[key] ?? [1, 50, 52428800][index])}
              />
            </label>
          ))}
        </div>
        <p className="os-domain-storage-hint">
          Storage quotas use bytes; 50 MiB equals 52,428,800 bytes.
        </p>

        <div className="os-domain-feature-grid" role="group" aria-label="Plan website features">
          {features.map(([key, label]) => (
            <label className="os-domain-feature" key={key}>
              <span>{label}</span>
              <input
                key={selectedPlan + key}
                className="os-domain-switch"
                name={key}
                type="checkbox"
                disabled={!selectedPlan}
                defaultChecked={Boolean(selectedConfig[key] ?? key === 'forms')}
              />
            </label>
          ))}
        </div>
        <div className="os-domain-form-footer">
          <button className="os-domain-save" disabled={pending || !selectedPlan} type="submit">
            <OsIcon name="check" size={18} />
            {pending ? 'Saving…' : 'Save plan capabilities'}
          </button>
        </div>
      </form>
      <p className="os-domain-save-message" role="status" aria-live="polite">{message}</p>
    </div>
  );
}
