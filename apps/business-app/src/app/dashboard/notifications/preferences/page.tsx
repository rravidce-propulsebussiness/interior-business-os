import Link from 'next/link';
import { automationServices } from '../../automations/service';
import { Preferences } from '../panels';
export default async function PreferencesPage() {
  const s = await automationServices('notification.manage_preferences', true),
    value = await s.automation.preferences();
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto max-w-4xl space-y-5 p-6"
    >
      <Link className="underline" href="/dashboard/notifications">
        Notifications
      </Link>
      <h1 className="text-2xl font-semibold">Your preferences</h1>
      <Preferences initial={value.configuration} version={value.version} />
    </main>
  );
}
