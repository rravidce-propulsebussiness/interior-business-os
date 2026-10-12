/* eslint-disable @next/next/no-html-link-for-pages -- Use fresh document navigations on Hostinger to avoid interrupted RSC Flight streams. */
import { redirect } from 'next/navigation';
import { createServerDatabase, isSupabaseConfigured } from '@business-os/database/server';
import { signIn } from '@business-os/auth/actions';
import { PremiumLoginForm } from './premium-login-form';
import './premium-login.css';

export const dynamic = 'force-dynamic';

const notices: Record<string, string> = {
  google: 'Google sign-in could not be completed. Try again or use your email and password.',
  propulse: 'ProPulse sign-in is not yet connected to Business OS. Use your Business OS email and password or Google.',
  unavailable: 'This sign-in provider is temporarily unavailable. Please use email and password.',
  callback: 'The sign-in link could not be verified. Please try again.',
};

function SymbolIcon({ name, size = 22 }: { name: 'home' | 'leads' | 'quote' | 'project' | 'shop' | 'growth' | 'shield' | 'arrow'; size?: number }) {
  const paths: Record<typeof name, string> = {
    home: 'M3 11.5 12 4l9 7.5M5.5 10V21h13V10M9 21v-6h6v6',
    leads: 'M16 19v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 9a4 4 0 1 0 0-8 4 4 0 0 0 0 8M19 11h4M21 9v4',
    quote: 'M6 2h9l5 5v15H6zM15 2v6h5M9 12h8M9 16h7',
    project: 'M3 6h18v15H3zM7 6V3h10v3M3 12h18',
    shop: 'M4 9h16l-1-6H5zM4 9v12h16V9M9 21v-8h6v8',
    growth: 'M3 17l6-6 4 4 8-9M15 6h6v6M3 21h18',
    shield: 'M12 2 4 6v6c0 5 3.5 8 8 10 4.5-2 8-5 8-10V6zM8.5 12l2.5 2.5 4.5-5',
    arrow: 'M4 12h16m-6-6 6 6-6 6',
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}

export default async function Login({ searchParams }: { searchParams: Promise<{ recovery?: string; provider_error?: string; confirmation?: string }> }) {
  const params = await searchParams;
  const recoveryComplete = params.recovery === 'complete';
  if (!recoveryComplete && isSupabaseConfigured()) {
    const { data } = await (await createServerDatabase()).auth.getUser();
    if (data.user) redirect('/dashboard');
  }

  const configured = isSupabaseConfigured();
  const alert = params.provider_error && notices[params.provider_error]
    ? notices[params.provider_error]
    : params.confirmation === 'failed'
      ? notices.callback
      : '';

  return (
    <main id="main-content" tabIndex={-1} className="pp-login">
      <div className="pp-login-frame">
        <section className="pp-login-showcase" aria-labelledby="pp-login-story-title">
          <div className="pp-login-photo" aria-hidden="true" />
          <div className="pp-login-photo-shade" aria-hidden="true" />
          <div className="pp-login-story-content">
            <a className="pp-login-story-brand" href="/" aria-label="ProPulse Business OS home">
              <span className="pp-login-story-logo"><SymbolIcon name="home" size={38} /></span>
              <span><strong>ProPulse</strong><small>Business OS</small></span>
            </a>

            <div className="pp-login-story-middle">
              <p className="pp-login-story-eyebrow">Construction · Interiors · Business</p>
              <h2 id="pp-login-story-title">Build. Manage. Grow.<br /><span>Your Business.</span></h2>
              <p className="pp-login-story-description">One powerful platform for construction, interiors and real estate businesses.</p>
              <div className="pp-login-benefits">
                <div><span className="pp-login-benefit-icon"><SymbolIcon name="leads" size={22} /></span>
                  <span><strong>Manage Leads</strong><small>Capture, track and convert enquiries easily.</small></span></div>
                <div><span className="pp-login-benefit-icon"><SymbolIcon name="quote" size={22} /></span>
                  <span><strong>Create Quotations</strong><small>Professional quotations with packages and BOQ.</small></span></div>
                <div><span className="pp-login-benefit-icon"><SymbolIcon name="project" size={22} /></span>
                  <span><strong>Projects &amp; Site Updates</strong><small>Track progress and collaborate with your team.</small></span></div>
                <div><span className="pp-login-benefit-icon"><SymbolIcon name="shop" size={22} /></span>
                  <span><strong>B2B Marketplace</strong><small>Source materials from approved business suppliers.</small></span></div>
                <div><span className="pp-login-benefit-icon"><SymbolIcon name="growth" size={22} /></span>
                  <span><strong>Grow Your Business</strong><small>Organize your clients and finances in one place.</small></span></div>
              </div>
            </div>

            <p className="pp-login-story-tagline">Better Tools.<br />Bigger Projects.</p>
          </div>
        </section>

        <section className="pp-login-right" aria-labelledby="login-title">
          <div className="pp-login-register-top">New to ProPulse? <a href="/register">Create an account</a></div>
          <div className="pp-login-card">
            <a className="pp-login-card-brand" href="/" aria-label="ProPulse Business OS">
              <span><SymbolIcon name="home" size={40} /></span>
              <span><strong>ProPulse</strong><small>Business OS</small></span>
            </a>
            <div className="pp-login-intro">
              <h1 id="login-title">Sign in</h1>
              <p>Access your business account and continue managing your projects, leads and marketplace.</p>
            </div>

            {recoveryComplete && <p className="pp-login-notice pp-login-success" role="status">Your password was updated successfully. Sign in with the new password.</p>}
            {!configured && <p className="pp-login-notice" role="status">Authentication setup is required before sign-in is available.</p>}
            {alert && <p className="pp-login-notice" role="alert">{alert}</p>}

            <div className="pp-login-providers" aria-label="Single sign-on options">
              <a href="/auth/google" className="pp-login-provider">
                <span className="pp-login-google" aria-hidden="true">G</span>
                <strong>Continue with Google</strong>
                <SymbolIcon name="arrow" size={19} />
              </a>
              <a href="/auth/propulse" className="pp-login-provider">
                <span className="pp-login-provider-house"><SymbolIcon name="home" size={28} /></span>
                <strong>Continue with ProPulse</strong>
                <SymbolIcon name="arrow" size={19} />
              </a>
            </div>

            <div className="pp-login-divider"><span /> <strong>OR</strong> <span /></div>
            <PremiumLoginForm action={signIn} />

            <div className="pp-login-trust">
              <span className="pp-login-trust-icon"><SymbolIcon name="shield" size={27} /></span>
              <span><strong>Secure &amp; Trusted</strong><small>Business and employee access is protected by account authentication and company permissions.</small></span>
            </div>
          </div>
          <div className="pp-login-bottom-links"><a href="/">← Back to home</a><span>© ProPulse Business OS</span></div>
        </section>
      </div>
    </main>
  );
}
