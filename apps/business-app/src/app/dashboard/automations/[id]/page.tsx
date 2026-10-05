import Link from 'next/link';
import { notFound } from 'next/navigation';
import { automationServices } from '../service';
import { RuleBuilder, TestRule } from '../builder';
export default async function AutomationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params,
    s = await automationServices('automation.view', true);
  const [rules, events] = await Promise.all([
    s.automation.read('rules', 1, id),
    s.automation.read('events'),
  ]);
  const row = rules.rows[0];
  if (!row) notFound();
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto max-w-4xl space-y-5 p-6"
    >
      <Link className="underline" href="/dashboard/automations">
        Automations
      </Link>
      <h1 className="text-2xl font-semibold">{String(row.name)}</h1>
      <RuleBuilder
        initial={row.configuration}
        id={id}
        version={Number(row.version)}
      />
      <TestRule
        ruleId={id}
        events={events.rows.map((e) => ({
          id: String(e.id),
          label: `${e.event_type} · ${e.occurred_at}`,
        }))}
      />
    </main>
  );
}
