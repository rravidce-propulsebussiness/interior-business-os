import type { Metadata } from 'next';
import { LegalPage } from '../legal-page';

export const metadata: Metadata = {
  title: 'Data Deletion | ProPulse Business OS',
  description:
    'Request removal of ProPulse Business OS and connected account data.',
  robots: { index: true, follow: true },
  alternates: { canonical: 'https://sghomesinterior.in/data-deletion' },
};

const updated = 'November 4, 2026';

export default function DataDeletionPage() {
  return (
    <LegalPage title="Data Deletion Instructions" updated={updated}>
      <p>
        A workspace owner or administrator can request deletion of the
        workspace’s ProPulse Business OS account data, including data associated
        with a connected Meta or WhatsApp Business integration.
      </p>
      <ol>
        <li>
          Email{' '}
          <a href="mailto:info@propulsetechnologies.online">
            info@propulsetechnologies.online
          </a>{' '}
          from the address associated with your workspace.
        </li>
        <li>
          Use the subject line <strong>Data deletion request</strong>.
        </li>
        <li>
          Include your business/workspace name and identify the Meta or
          WhatsApp Business account to disconnect or delete. Do not send
          passwords, access tokens or message contents.
        </li>
      </ol>
      <p>
        We will verify that the requester is authorized, acknowledge the
        request and remove or de-identify the requested information where
        applicable. Some records may be retained where required for legal,
        security, accounting or dispute-resolution purposes. Connected Meta or
        WhatsApp assets may also need to be removed by an administrator in
        Meta Business Settings.
      </p>
      <p>
        You may also ask your workspace owner to remove your user account or
        disconnect a business integration. See our{' '}
        <a href="/privacy-policy">Privacy Policy</a> for more information.
      </p>
    </LegalPage>
  );
}
