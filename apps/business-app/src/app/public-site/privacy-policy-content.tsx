const PROPULSE_HOST = 'propulsetechnologies.online';

export function isPropulsePrivacyPage(host: string | undefined, path: string) {
  return host === PROPULSE_HOST && path === '/privacy-policy';
}

export function privacyPolicyMetadata() {
  return {
    title: 'Privacy Policy | ProPulse',
    description:
      'How ProPulse collects, uses and shares Meta lead information for lead capture and business marketplace access.',
    alternates: {
      canonical: 'https://propulsetechnologies.online/privacy-policy',
    },
    robots: { index: true, follow: true },
  };
}

export function PrivacyPolicyContent() {
  return (
    <main className="privacy-page">
      <style>{`
        .privacy-page{max-width:920px;margin:0 auto;padding:clamp(28px,6vw,72px) 22px 80px;color:#18253a;font:16px/1.75 Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        .privacy-page .eyebrow{color:#a04435;font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}
        .privacy-page h1{margin:10px 0 8px;font-size:clamp(34px,6vw,54px);line-height:1.08;letter-spacing:-.04em;color:#263b58}
        .privacy-page h2{margin:34px 0 10px;font-size:22px;line-height:1.25;color:#263b58}
        .privacy-page p,.privacy-page li{color:#4c5c70}
        .privacy-page .updated{margin:0 0 28px;color:#7b8796;font-size:14px}
        .privacy-page .lead{padding:20px 22px;border:1px solid #eadbd6;border-radius:16px;background:#fff8f5;color:#35465d}
        .privacy-page a{color:#9c3e31;text-decoration:underline;text-underline-offset:3px}
        .privacy-page ul{padding-left:24px}
      `}</style>
      <span className="eyebrow">ProPulse Business</span>
      <h1>Privacy Policy</h1>
      <p className="updated">Last updated: 14 November 2026</p>
      <p className="lead">
        ProPulse provides Meta lead capture and a business marketplace. When a
        business connects a Meta Page and lead form, we retrieve submitted
        enquiries and may make those enquiries available to businesses that
        purchase lead access through ProPulse. This policy explains that use.
      </p>

      <h2>Information we process</h2>
      <ul>
        <li>
          Meta connection information, such as the Meta account and Page
          identifiers, Page and lead-form names, and the permissions needed to
          connect and receive leads.
        </li>
        <li>
          Information a person submits on a connected lead form, which may
          include their name, phone number, email address, location, project
          needs, and other answers requested by that form.
        </li>
        <li>
          Lead and advertising identifiers and details, such as lead ID, ad ID,
          ad or campaign name, platform, and Meta-reported ad spend used to
          calculate a lead price.
        </li>
        <li>
          Basic technical and activity records needed to operate, secure, and
          troubleshoot the service.
        </li>
      </ul>

      <h2>How we use the information</h2>
      <p>
        We use this information to connect the business-selected Meta Page and
        form, retrieve and organize enquiries, prevent duplicate imports,
        route leads to the appropriate marketplace, calculate lead prices
        using reported ad spend and the configured markup, and provide the
        lead access purchased by a business. The Meta connection is used for
        lead retrieval and related read-only ad-spend reporting; ProPulse does
        not use it to create or edit advertising campaigns.
      </p>

      <h2>When lead information is shared</h2>
      <p>
        Lead details are shown only to the business or businesses authorized
        to access that lead through the ProPulse marketplace, including a
        business that purchases lead access. We also use service providers
        that host or secure ProPulse and process data for us under service
        instructions. We do not make connected lead lists public or provide
        them to general data brokers.
      </p>
      <p>
        A business receiving a lead must use its information to respond to the
        enquiry and provide the service the person requested, consistent with
        the notice and choices presented on the original lead form.
      </p>

      <h2>Meta connection and security</h2>
      <p>
        A business chooses which Page and lead form to connect and can
        disconnect that connection in ProPulse. OAuth access tokens are
        encrypted at rest. Disconnecting stops future imports from that
        connection; it does not automatically remove lead information already
        imported or previously shared with a lead buyer.
      </p>

      <h2>Retention and requests</h2>
      <p>
        We retain connection and lead records for as long as needed to operate
        the lead service, provide marketplace access, maintain transaction and
        support records, and meet applicable obligations. A person may ask
        ProPulse to access, correct, or delete information by emailing{' '}
        <a href="mailto:info@propulsetechnologies.online">
          info@propulsetechnologies.online
        </a>
        . We will review and respond to requests as applicable. Deletion may
        not remove information a business has already received or records we
        must retain.
      </p>

      <h2>Business responsibilities</h2>
      <p>
        A business connecting a Meta form is responsible for providing
        appropriate privacy notices and choices on that form and for ensuring
        that its use and sharing of submitted information is permitted. People
        who submit a form should review the form’s notice and contact the
        business that published it about the enquiry.
      </p>

      <h2>Contact ProPulse</h2>
      <p>
        For privacy questions or requests, contact ProPulse at{' '}
        <a href="mailto:info@propulsetechnologies.online">
          info@propulsetechnologies.online
        </a>{' '}
        or call <a href="tel:+919000360812">+91 90003 60812</a>. ProPulse is
        based in Hyderabad, Telangana, India.
      </p>
    </main>
  );
}
