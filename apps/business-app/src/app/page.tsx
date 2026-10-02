import Link from 'next/link';
import { FoundationPage } from '@business-os/ui';
export default function Page() {
  return (
    <FoundationPage
      title="Your business workspace"
      description="An isolated workspace for your organization and its enabled modules."
    >
      <nav className="mt-6 flex gap-6" aria-label="Account">
        <Link className="underline" href="/dashboard">
          Open dashboard
        </Link>
        <Link className="underline" href="/login">
          Sign in
        </Link>
      </nav>
    </FoundationPage>
  );
}
