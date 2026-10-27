import './no-company-workspace.css';

function WorkflowPreview() {
  return <div className="bo-preview" aria-label="Preview of the connected business workspace">
    <div className="bo-orbit" aria-hidden="true" />
    <div className="bo-preview-board">
      <div className="bo-board-header"><i/><i/><i/><span>WORKSPACE PREVIEW</span></div>
      <div className="bo-board-body">
        <div className="bo-side-ghost">
          <div className="bo-side-logo"/><div className="bo-ghost-line active"/>
          <div className="bo-ghost-line"/><div className="bo-ghost-line short"/>
          <div className="bo-ghost-line"/>
        </div>
        <div className="bo-workspace-mini">
          <div className="bo-mini-label">ALL CONNECTED</div>
          <div className="bo-mini-title">Work flows better together</div>
          <div className="bo-process">
            <div className="bo-process-box">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                <rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 9h10M7 13h6M7 17h8"/>
              </svg><span>Leads</span>
            </div><div className="bo-process-arrow"/>
            <div className="bo-process-box">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                <path d="M7 3h9l4 4v14H5V3zM15 3v5h5M8 12h9M8 16h7"/>
              </svg><span>Quotes</span>
            </div><div className="bo-process-arrow"/>
            <div className="bo-process-box">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                <path d="M3 19V8l9-5 9 5v11zM3 10l9 5 9-5M12 15v6"/>
              </svg><span>Projects</span>
            </div>
          </div>
          <div className="bo-mini-note"><span className="bo-tick">✓</span> One connected workflow for your business</div>
        </div>
      </div>
    </div>
    <div className="bo-tiny-floating"><span className="bo-tiny-icon">✓</span>
      <span><b>All in one place</b><small>Manage. Collaborate. Grow.</small></span>
    </div>
  </div>;
}
function OptionIcon({kind}: {kind: 'create'|'import'|'join'}) {
  if (kind === 'create') return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 21V7l7-4 7 4v14M1 21h21M9 21v-6h5v6M8 9h2M8 12h2M14 9h1M14 12h1"/>
  </svg>;
  if (kind === 'import') return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 12a4 4 0 0 1 4-4h4a4 4 0 0 1 0 8h-2M15 12a4 4 0 0 1-4 4H7a4 4 0 0 1 0-8h2M8 12h8"/>
  </svg>;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="9" cy="8" r="3"/><path d="M2 21v-3a5 5 0 0 1 10 0v3M17 4v6M14 7h6M15 21v-2a4 4 0 0 0-2-3.5"/>
  </svg>;
}
/** Only rendered when authenticated account has no active organization.
 * Existing employee memberships and direct client/project portal access
 * retain their established authorization/redirect flows. */
export function NoCompanyWorkspace() {
  return <main id="main-content" className="bo-wrap">
    <header className="bo-topbar"><nav className="bo-nav" aria-label="Workspace setup">
      <a className="bo-brand" href="/"><span className="bo-mark" aria-hidden="true">P</span>
        <span className="bo-brand-name">ProPulse<span>BUSINESS OS</span></span></a>
      <div className="bo-nav-end"><span className="bo-nav-hint"><i/>Workspace setup</span>
        <a className="bo-home-link" href="/">Back to website ↗</a></div>
    </nav></header>
    <div className="bo-content">
      <section className="bo-hero" aria-labelledby="bo-headline">
        <div><div className="bo-eyebrow"><span aria-hidden="true">✦</span> WELCOME TO YOUR BUSINESS OS</div>
          <h1 id="bo-headline">One workspace.<br/><em>Every possibility.</em></h1>
          <p className="bo-hero-p">Your account is ready. Set up a company, connect your ProPulse profile, or join a team to start managing leads, quotations, projects and more.</p>
          <div className="bo-step-hint"><span><b>1</b> Choose a setup</span><span className="bo-chev">→</span><span><b>2</b> Connect your company</span><span className="bo-chev">→</span><span><b>3</b> Start working</span></div>
        </div>
        <WorkflowPreview/>
      </section>
      <section className="bo-choose" aria-labelledby="bo-options-title">
        <div className="bo-section-head"><div><span className="bo-section-kicker">GET STARTED</span>
          <h2 id="bo-options-title">How would you like to begin?</h2>
          <p>Choose the option that matches your business.</p></div>
          <span className="bo-mini-caption">Just a few steps between you and your workspace.</span></div>
        <div className="bo-cards">
          <a className="bo-option bo-featured" href="/dashboard/company/apply">
            <span className="bo-option-tag">NEW BUSINESS</span>
            <span className="bo-option-icon"><OptionIcon kind="create"/></span>
            <h3>Create a company</h3>
            <p>Starting fresh? Set up your company profile and get your own Business OS workspace.</p>
            <span className="bo-card-cta">Create your workspace <i aria-hidden="true">→</i></span>
          </a>
          <a className="bo-option" href="/auth/propulse">
            <span className="bo-option-tag">NO DUPLICATE SETUP</span>
            <span className="bo-option-icon"><OptionIcon kind="import"/></span>
            <h3>Import from ProPulse</h3>
            <p>Already registered as a professional? Bring your existing company details into Business OS.</p>
            <span className="bo-card-cta">Connect existing company <i aria-hidden="true">→</i></span>
          </a>
          <a className="bo-option" href="/dashboard/company/invitations">
            <span className="bo-option-tag">TEAM ACCESS</span>
            <span className="bo-option-icon"><OptionIcon kind="join"/></span>
            <h3>Join with invite code</h3>
            <p>Have an invitation code from a company owner? Join with your verified email and assigned role.</p>
            <span className="bo-card-cta">Enter invitation code <i aria-hidden="true">→</i></span>
          </a>
        </div>
      </section>
      <section className="bo-help"><details><summary>Not sure which option to choose?</summary>
        <div className="bo-help-body"><strong>New company:</strong> create a company. <strong>Already on ProPulse:</strong> import your existing business without duplicate details. <strong>Employee:</strong> use a code from your company owner or accept your email invitation. Existing client project access works through the Client Portal.</div>
      </details></section>
      <div className="bo-footer">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true"><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11zM9 12l2 2 4-4"/></svg>
        Your company data remains private to your workspace.
      </div>
    </div>
  </main>;
}
