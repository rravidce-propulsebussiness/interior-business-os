import type { Metadata } from 'next';
import { LegalPage } from '../legal-page';

export const metadata: Metadata = {
  title: 'Privacy Policy | ProPulse Business OS',
  description:
    'Privacy details for ProPulse Business OS and messaging integrations.',
  robots: { index: true, follow: true },
  alternates: { canonical: 'https://sghomesinterior.in/privacy-policy' },
};

const updated = 'November 4, 2026';

export default function PrivacyPolicyPage() {
  return (
    <LegalPage title="Privacy Policy" updated={updated}>
      <p>
        ProPulse Business OS supports construction and interior business teams. This policy explains how Star Glow Home Infra Construction and
        Interior Private Limited, operating the ProPulse service, handles
        information when you visit the service or use a business workspace.
      </p>

      <h2>Information we handle</h2>
      <p>
        Depending on the features your business uses, information may include
        account and contact details; business and workspace settings; leads,
        customers, projects, quotations, invoices, site reports, documents,
        photographs, team and supplier records; support requests; and technical
        and security logs.
      </p>
      <p>
        If an administrator connects a Meta or WhatsApp Business account, the
        service may handle the account and phone-number identifiers, business
        profile details, connection status, message or recipient details needed
        for enabled messaging features, and delivery or webhook events. The
        information available depends on the permissions approved by the
        business and the features it enables.
      </p>

      <h2>How we use information</h2>
      <ul>
        <li>To provide and maintain the workspace and its enabled features.</li>
        <li>
          To route business records to authorized users in the same workspace.
        </li>
        <li>To operate requested integrations and automation.</li>
        <li>To secure the service, troubleshoot faults and prevent misuse.</li>
        <li>To respond to support, privacy and legal requests.</li>
      </ul>

      <h2>When information is shared</h2>
      <p>
        We do not sell personal information. Information is made available to
        authorized members of the relevant workspace and to service providers
        needed to host, secure and operate the service. When you enable Meta or
        WhatsApp integration, information is exchanged with Meta and WhatsApp as
        needed for that integration and is also subject to their terms and
        privacy notices. We may disclose information when required by law or
        needed to protect the service and its users.
      </p>

      <h2>Storage and retention</h2>
      <p>
        Information is retained while the workspace is active and for the
        additional period reasonably needed to provide the service, maintain
        security and records, resolve disputes, and meet legal obligations.
        Retention may differ by record type. A workspace administrator can
        request deletion using the instructions on our Data Deletion page.
      </p>

      <h2>Security and access</h2>
      <p>
        We use access controls and technical safeguards designed to protect
        information. Workspace administrators are responsible for assigning
        appropriate roles and protecting their sign-in credentials. No online
        service can guarantee absolute security.
      </p>

      <h2>Your choices and requests</h2>
      <p>
        You can ask your workspace administrator to correct or remove business
        records managed by that workspace. For an account or connected Meta data
        deletion request, follow the steps on our{' '}
        <a href="/data-deletion">Data Deletion page</a>. We may need to verify
        the requester and may retain records where the law requires or permits
        it.
      </p>

      <h2>Children and changes</h2>
      <p>
        The service is intended for business users and is not directed to
        children. We may update this policy as the service changes. The latest
        version will be published on this page with its updated date.
      </p>
    </LegalPage>
  );
}
