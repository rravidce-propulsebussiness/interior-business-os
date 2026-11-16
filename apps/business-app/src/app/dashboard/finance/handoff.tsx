import Link from 'next/link';
import { activeOrganization, serverServices } from '@business-os/auth/server';
import { canAccess } from '@business-os/auth';
import { createFinanceRepository } from '@business-os/database/finance';
import { FinanceForm } from './form';
import { text } from './presentation';
export async function ContractHandoff({ revisionId }: { revisionId: string }) {
  const context = await activeOrganization();
  if (!context) return null;
  const allowed = (permission: string) =>
    canAccess(context, {
      organizationId: context.organizationId,
      permission,
      moduleKey: 'billing',
    }) && context.entitlements.includes('projects');
  if (!allowed('contract.view') && !allowed('contract.create')) return null;
  const s = await serverServices(),
    finance = createFinanceRepository(s.client, context.organizationId);
  const existing = allowed('contract.view')
    ? (await finance.search('contracts', { revision_id: revisionId })).rows[0]
    : undefined;
  if (existing)
    return (
      <p className="my-4">
        <Link
          className="underline"
          href={`/dashboard/finance/contracts/${text(existing, 'id')}`}
        >
          Open contract {text(existing, 'contract_number')}
        </Link>
      </p>
    );
  if (!allowed('contract.create')) return null;
  const { data } = await s.client
    .from('quotation_customer_responses')
    .select('action')
    .eq('organization_id', context.organizationId)
    .eq('revision_id', revisionId)
    .maybeSingle();
  if (data?.action !== 'approved')
    return (
      <section className="my-5 rounded border p-4">
        <h2 className="text-lg font-semibold">
          Next: prepare signed agreement
        </h2>
        <p className="mt-2 text-sm">
          No separate online customer approval is required. Once the owner has
          finalized and issued this quotation, open the converted Won
          lead&apos;s project, choose <strong>Quote &amp; Agreement</strong>,
          and select
          <strong> Prepare agreement</strong> for the correct issued quotation.
          Then upload the signed PDF as the customer&apos;s acceptance evidence.
        </p>
        <Link
          className="mt-3 inline-block underline"
          href="/dashboard/projects"
        >
          Open Projects
        </Link>
      </section>
    );
  return (
    <section className="my-5 rounded border p-4">
      <h2 className="text-xl">Quotation accepted — prepare agreement</h2>
      <p className="mt-2 text-sm text-slate-600">
        Your accepted quotation supplies the project scope. Construction stages
        follow quoted floors; interior stages follow the room-wise BOQ, included
        trades, materials and specifications. Creating the agreement prepares
        the corresponding timeline automatically. Work cannot begin until
        agreement and design approvals are recorded.
      </p>
      <FinanceForm
        title="Create agreement and prepare timeline"
        initial={{ action: 'create_contract', revision_id: revisionId }}
      />
    </section>
  );
}
export async function ProjectCommercial({ projectId }: { projectId: string }) {
  const context = await activeOrganization();
  if (
    !context ||
    !canAccess(context, {
      organizationId: context.organizationId,
      permission: 'contract.view',
      moduleKey: 'billing',
    }) ||
    !context.entitlements.includes('projects')
  )
    return null;
  return (
    <p className="my-3">
      <Link
        className="underline"
        href={`/dashboard/finance/contracts?project_id=${projectId}`}
      >
        Commercial: contracts, schedules, invoices and payments
      </Link>
    </p>
  );
}
export async function CustomerStatementLink({
  customerId,
}: {
  customerId: string;
}) {
  const context = await activeOrganization();
  if (
    !context ||
    !canAccess(context, {
      organizationId: context.organizationId,
      permission: 'financial_report.view',
      moduleKey: 'billing',
    })
  )
    return null;
  return (
    <p className="my-3">
      <Link
        className="underline"
        href={`/dashboard/finance/statements/${customerId}`}
      >
        Customer account statement
      </Link>
    </p>
  );
}
