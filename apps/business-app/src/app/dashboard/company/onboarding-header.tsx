import { signOut } from '@business-os/auth/actions';
import './onboarding-header.css';

/** Shared navigation for new companies and first-time invited members.
 * Do not redirect Home to /dashboard: accounts without a company would
 * land back on the same onboarding screen. Sign-out uses the canonical
 * server action to clear both Supabase and workspace cookies.
 */
export function WorkspaceOnboardingHeader() {
  return (
    <header className="workspace-onboarding-header">
      <div className="workspace-onboarding-header-inner">
        <a
          className="workspace-onboarding-brand"
          href="/"
          aria-label="ProPulse Business OS home"
        >
          <span className="workspace-onboarding-brand-mark" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m3 11 9-7 9 7M5 10v10h14V10M9 20v-7h6v7" />
            </svg>
          </span>
          <span className="workspace-onboarding-brand-text">
            <strong>ProPulse</strong>
            <small>BUSINESS OS</small>
          </span>
        </a>
        <nav
          className="workspace-onboarding-nav"
          aria-label="Account navigation"
        >
          <a className="workspace-onboarding-home" href="/">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m3 11 9-7 9 7M5 10v10h14V10M9 20v-7h6v7" />
            </svg>
            Home
          </a>
          <form action={signOut} className="workspace-onboarding-logout-form">
            <button type="submit" className="workspace-onboarding-logout">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
              Log out
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}
