import type { Metadata } from 'next';
import { LegalPage } from '../legal-page';

export const metadata: Metadata = {
  title: 'Terms of Service | ProPulse Business OS',
  description:
    'Terms for using ProPulse Business OS and its business workspace features.',
  robots: { index: true, follow: true },
  alternates: { canonical: 'https://sghomesinterior.in/terms-of-service' },
};

const updated = 'November 4, 2026';

export default function TermsOfServicePage() {
  return (
    <LegalPage title="Terms of Service" updated={updated}>
      <p>
        These terms apply to access to ProPulse Business OS, operated by Star
        Glow Home Infra Construction and Interior Private Limited. By creating
        an account or using the service, you agree to these terms on behalf of
        yourself and, where applicable, the business you represent.
      </p>

      <h2>Accounts and workspaces</h2>
      <p>
        You must provide accurate account information, keep your credentials
        secure and use only the access assigned to you. A workspace
        administrator controls membership and permissions for that business.
        You are responsible for activity carried out through your account and
        for ensuring that your team has appropriate access.
      </p>

      <h2>Business records and communications</h2>
      <p>
        Your business remains responsible for the information it enters,
        imports, stores or sends through the service, including customer,
        employee, supplier and recipient information. You must have the rights,
        notices and permissions required to use that information and must
        comply with applicable law.
      </p>

      <h2>Connected services and messaging</h2>
      <p>
        Optional integrations are provided subject to the third party’s own
        terms and availability. If you connect Meta or WhatsApp Business, you
        must follow Meta’s and WhatsApp’s terms, messaging policies, template
        rules and consent requirements. Do not use the service for spam,
        unlawful messages, deceptive conduct or messages to people who have
        withdrawn consent.
      </p>

      <h2>Acceptable use</h2>
      <p>
        Do not attempt to bypass workspace permissions, interfere with the
        service, upload malicious content, access another business’s records,
        or use the service in a way that violates law or third-party rights.
        We may restrict access when reasonably necessary to protect users,
        comply with law or address misuse.
      </p>

      <h2>Service availability and changes</h2>
      <p>
        We work to keep the service available, but features may change and
        outages can occur. We may update these terms when the service or legal
        requirements change. Continued use after an updated version is
        published means you accept the updated terms.
      </p>

      <h2>Responsibility and contact</h2>
      <p>
        The service is provided as a business operations tool. You remain
        responsible for reviewing business records, quotations, approvals,
        messages and decisions before acting on them. To report an issue or ask
        about these terms, contact us at{' '}
        <a href="mailto:info@propulsetechnologies.online">
          info@propulsetechnologies.online
        </a>
        .
      </p>
    </LegalPage>
  );
}
