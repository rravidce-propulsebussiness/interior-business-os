/**
 * Suggested role configurations, not industry security boundaries.
 * They are copied via the canonical save_role RPC and remain editable by
 * authorized owners. Project/site grants require independent RLS checks.
 */
export type RoleIndustry = 'universal' | 'construction' | 'interior';

export interface RolePreset {
  readonly key: string;
  readonly name: string;
  readonly industries: readonly RoleIndustry[];
  readonly permissions: readonly string[];
  readonly description: string;
}

export const rolePresets: readonly RolePreset[] = [
  {
    key: 'marketing',
    name: 'Marketing',
    industries: ['universal'],
    permissions: ['organization.view', 'crm.view', 'crm.create', 'brochure.view'],
    description: 'Campaign and customer enquiry collaboration; no private rates or finance.',
  },
  {
    key: 'sales_limited',
    name: 'Sales (limited)',
    industries: ['universal'],
    permissions: ['organization.view', 'crm.view', 'crm.create', 'quotation.view', 'quotation.create'],
    description: 'Create leads and quotations without overriding rates, viewing costs or approving payments.',
  },
  {
    key: 'estimator_limited',
    name: 'Estimator (limited)',
    industries: ['construction', 'interior'],
    permissions: ['organization.view', 'catalog.view', 'quotation.view', 'quotation.create'],
    description: 'Build estimates without revealing private internal costs or changing approved rate books.',
  },
  {
    key: 'customer_support',
    name: 'Customer Support',
    industries: ['universal'],
    permissions: ['organization.view', 'crm.view'],
    description: 'Read customer context; sensitive modifications require separately approved grants.',
  },
  {
    key: 'quotation_preparer',
    name: 'Quotation Preparer',
    industries: ['universal'],
    permissions: ['organization.view', 'catalog.view', 'quotation.view', 'quotation.create', 'quotation.edit'],
    description: 'Prepare quotation drafts; internal costs and approvals are separate.',
  },
  {
    key: 'site_engineer',
    name: 'Site Engineer',
    industries: ['construction', 'interior'],
    permissions: ['organization.view', 'branch.view'],
    description: 'Restricted starting profile. Project-specific work access must be granted after RLS-scoped assignments are configured.',
  },
  {
    key: 'site_supervisor_limited',
    name: 'Site Supervisor (limited)',
    industries: ['construction', 'interior'],
    permissions: ['organization.view', 'branch.view'],
    description: 'Least-privilege site role; no organization-wide finance or cost visibility.',
  },
  {
    key: 'watchman',
    name: 'Watchman / Security',
    industries: ['construction', 'interior'],
    permissions: ['organization.view', 'branch.view'],
    description: 'Restricted role. Visitor and delivery gate permissions are not yet implemented.',
  },
  {
    key: 'carpenter',
    name: 'Carpenter',
    industries: ['construction', 'interior'],
    permissions: ['organization.view', 'branch.view'],
    description: 'Restricted worker role; project and task access needs explicit assignment.',
  },
  {
    key: 'civil_engineer',
    name: 'Civil Engineer',
    industries: ['construction'],
    permissions: ['organization.view', 'branch.view'],
    description: 'Construction preset with no cross-project or financial access by default.',
  },
  {
    key: 'interior_designer_limited',
    name: 'Interior Designer (limited)',
    industries: ['interior', 'construction'],
    permissions: ['organization.view', 'branch.view', 'catalog.view'],
    description: 'Design-oriented role; company-wide project access is not granted by default.',
  },
  {
    key: 'accountant_limited',
    name: 'Accountant (limited)',
    industries: ['universal'],
    permissions: ['organization.view', 'billing.view', 'payment.view', 'report.financial'],
    description: 'Read accounting summaries; posting and payment approvals need separate grants.',
  },
  {
    key: 'storekeeper',
    name: 'Storekeeper',
    industries: ['universal'],
    permissions: ['organization.view', 'branch.view'],
    description: 'Stock operations can be delegated only after the inventory scope has been reviewed.',
  },
] as const;

export function getRolePreset(key: string): RolePreset | undefined {
  return rolePresets.find((preset) => preset.key === key);
}
