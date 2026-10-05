import Link from 'next/link';
import { automationServices } from '../service';
import { RuleBuilder } from '../builder';
export default async function NewAutomationPage() {
  await automationServices('automation.manage', true);
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto max-w-4xl space-y-5 p-6"
    >
      <Link className="underline" href="/dashboard/automations">
        Automations
      </Link>
      <h1 className="text-2xl font-semibold">New automation</h1>
      <RuleBuilder />
    </main>
  );
}
