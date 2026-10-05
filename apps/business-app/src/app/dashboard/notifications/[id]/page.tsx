import Link from 'next/link';
import { automationServices } from '../../automations/service';
export default async function NotificationSourcePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params,
    s = await automationServices('notification.view', true),
    source = await s.automation.target(id);
  const kind = String(source.kind),
    target = String(source.id);
  const operationEntities: Record<string, string> = {
    task: 'project_tasks',
    milestone: 'project_milestones',
    inspection: 'project_inspections',
    snag: 'project_snags',
    handover: 'handover_records',
    plan: 'execution_plans',
    inventory: 'inventory_transactions',
  };
  const href =
    kind === 'lead'
      ? `/dashboard/crm/leads/${target}`
      : kind === 'followup'
        ? '/dashboard/crm/followups'
        : kind === 'quotation'
          ? `/dashboard/quotations/${source.quotation_id}`
          : operationEntities[kind]
            ? `/dashboard/operations/${operationEntities[kind]}/${target}`
            : kind === 'project'
              ? `/dashboard/crm/projects/${target}`
              : ['contract', 'invoice', 'payment', 'change_order'].includes(
                    kind,
                  )
                ? '/dashboard/finance'
                : '/dashboard/execution';
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto max-w-4xl space-y-5 p-6"
    >
      <Link className="underline" href="/dashboard/notifications">
        Notifications
      </Link>
      <h1 className="text-2xl font-semibold">{String(source.title)}</h1>
      <p>
        {String(source.number)} · {String(source.status)}
      </p>
      <p>
        Current source record. Access is checked each time you open this
        notification.
      </p>
      <Link className="underline" href={href}>
        Open {kind.replaceAll('_', ' ')}
      </Link>
    </main>
  );
}
