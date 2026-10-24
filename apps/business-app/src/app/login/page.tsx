/* eslint-disable @next/next/no-html-link-for-pages -- Hostinger auth transitions require full document navigation. */
import { redirect } from 'next/navigation';
import { publicAuthOrigin } from '@business-os/auth/origin';
import { resolveLoginDestination } from '@business-os/auth/login-destination';
import {
  createServerDatabase,
  isSupabaseConfigured,
} from '@business-os/database/server';
import { signIn } from '@business-os/auth/actions';
import { PremiumLoginForm } from './premium-login-form';
import './premium-login.css';

export const dynamic = 'force-dynamic';

const notices: Record<string, string> = {
  google_disabled: 'Google sign-in is not enabled in Business OS Supabase Authentication. Please use email and password until an administrator activates the Google provider.',
  google: 'Google sign-in could not be completed. Try again or use your email and password.',
  propulse: 'ProPulse sign-in is not yet activated. Once the secure account connection is configured, you can sign in with your verified ProPulse account.',
  unavailable: 'This sign-in provider is temporarily unavailable. Please use email and password.',
  callback: 'The sign-in link could not be verified. Please try again.',
};

type LoginIcon = 'home' | 'users' | 'file' | 'chart' | 'package' | 'wallet' | 'shield' | 'arrow' | 'check' | 'eye';
const glyphs: Record<LoginIcon, string> = {
  home: 'M3 11.5 12 4l9 7.5M5.5 10V21h13V10M9 21v-6h6v6',
  users: 'M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M17 3.13a4 4 0 0 1 0 7.75',
  file: 'M6 2h9l5 5v15H6zM15 2v6h5M9 12h8M9 16h8',
  chart: 'M3 20V11M9 20V5M15 20v-8M21 20V8M2 22h20',
  package: 'm12 2 10 6-10 6L2 8zM2 8v9l10 6 10-6V8M12 14v9',
  wallet: 'M3 6h18v15H3zM3 6V3h16M15 12h6v5h-6z',
  shield: 'M12 2 4 6v6c0 5 3.5 8 8 10 4.5-2 8-5 8-10V6zM8 12l3 3 5-6',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  check: 'm4 12 5 5L20 6',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
};

function SymbolIcon({ name, size = 22 }: { name: LoginIcon; size?: number }) {
  return (
    <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d={glyphs[name]} />
    </svg>
  );
}

function Brand() {
  return (
    <span className="pp-login-brand">
      <span className="pp-login-brand-mark"><SymbolIcon name="home" size={36}/></span>
      <span><strong>ProPulse</strong><small>BUSINESS OS</small></span>
    </span>
  );
}

/** Pure vector scene; decorative only. Light SVG motion is CSS driven and reduced-motion aware. */
function ConstructionIllustration() {
  return (
    <svg className="pp-login-construction-svg" viewBox="0 0 880 540" aria-hidden="true" focusable="false" fill="none" preserveAspectRatio="xMidYMax meet">
      <defs>
        <linearGradient id="pp-login-wall" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#f5d1b2"/><stop offset=".55" stopColor="#ffead9"/><stop offset="1" stopColor="#de9f75"/>
        </linearGradient>
        <linearGradient id="pp-login-floor" x1="0" x2="1" y1="0" y2="1">
          <stop stopColor="#ffe4d2"/><stop offset="1" stopColor="#f2a56e"/>
        </linearGradient>
        <linearGradient id="pp-login-vest" x1="0" x2="1">
          <stop stopColor="#f36c17"/><stop offset="1" stopColor="#ff953f"/>
        </linearGradient>
      </defs>
      <path d="M0 395Q160 330 330 380T880 350V540H0Z" fill="#ffeddc"/>
      <path d="M0 469Q260 424 466 470T880 451V540H0Z" fill="#ffd9b8" opacity=".72"/>
      <g opacity=".35" stroke="#f5b582" strokeWidth="2">
        <path d="M4 413V304h48v109M11 324h36M11 345h36M11 366h36M11 387h36"/>
        <path d="M75 410V263h67v147M80 286h55M80 311h55M80 336h55M80 361h55M80 386h55"/>
        <path d="M761 397V299h70v98M765 325h60M765 348h60M765 372h60"/>
        <path d="M683 405V255h58v150M686 285h53M686 314h53M686 342h53"/>
      </g>
      <g stroke="#f17b30" strokeLinecap="round" strokeLinejoin="round">
        {/* tower crane */}
        <path d="M299 455V113M278 455h44M281 113h37M276 125h245M299 125v-40M289 85h20M279 125l20-40 18 40" strokeWidth="4"/>
        <g strokeWidth="1.8" opacity=".85">
          <path d="M299 145l18 26-18 26 18 26-18 26 18 26-18 26 18 26-18 26 18 26-18 26"/>
          <path d="M318 145l-19 26 19 26-19 26 19 26-19 26 19 26-19 26 19 26-19 26"/>
          <path d="M320 125l30 23 29-23 32 23 29-23 31 23 29-23M320 125l22-19 23 19 24-19 23 19 24-19 24 19 25-19"/>
        </g>
        <path d="M280 125h-99l16 23h82M237 125l-18 23M210 125l-13 23" strokeWidth="3"/>
        <path d="M181 125v9h-16" strokeWidth="2.5"/>
        <g className="pp-login-crane-load" strokeWidth="2.5"><path d="M464 125v72M453 197h22M453 197l11 15 11-15M452 212h24v14h-24z"/></g>
      </g>
      {/* Building structure */}
      <g strokeLinejoin="round" strokeLinecap="round">
        <path d="M383 421V217l180-69 133 44v229" fill="url(#pp-login-wall)" stroke="#d58b52" strokeWidth="3"/>
        <path d="M563 148v273" stroke="#d49a74" strokeWidth="3"/>
        <path d="m383 217 180-69 133 44-178 71z" fill="#ffe4cf" stroke="#d69b73" strokeWidth="3"/>
        <path d="m383 284 135 39 178-64M383 355l135 39 178-63" stroke="#e58c50" strokeWidth="10"/>
        <path d="M518 263v158M438 236v185M606 230v191M655 208v213" stroke="#c57c4f" strokeWidth="8"/>
        <path d="M401 248v36l108 29v-39zM402 319v33l107 33v-39z" fill="#f6c49d" opacity=".77"/>
        <path d="M574 227l38-15v43l-38 15zM631 207l39-13v40l-39 14zM574 299l38-14v46l-38 14zM631 279l39-13v47l-39 14z" fill="#fff7ec" stroke="#d4a07c" strokeWidth="2"/>
        <path d="M382 420h320v19H382z" fill="#efac73"/>
        <path d="M367 451h345" stroke="#e69c65" strokeWidth="4"/>
        {/* scaffolding */}
        <g stroke="#f49a52" strokeWidth="2.5" opacity=".85">
          <path d="M369 212V450M407 212V450M523 245V454M548 237V455M367 278h181M367 350h181M367 420h181"/>
          <path d="M369 279l38 71-38 70M407 279l-38 71 38 70M523 279l25 71-25 70"/>
          <path d="M544 233h158M542 267h160M542 345h160M542 420h160M702 206v248M683 206v248"/>
        </g>
      </g>
      {/* Equipment */}
      <g transform="translate(725 405)">
        <path d="M3 32h95l10 16H-4z" fill="#f7a35f"/>
        <path d="M27 10h39l17 28H20z" fill="#f98226"/>
        <path d="M35 15h24l11 17H29z" fill="#fff2e3"/>
        <path d="M65 22l28-42 10 4-28 49" fill="#ee7c2f"/>
        <path d="m99-22 16-6 5 14-9 8" fill="#e99153"/>
        <rect x="6" y="45" width="100" height="19" rx="9" fill="#885d47"/>
        <circle cx="29" cy="54" r="8" fill="#ddb292"/><circle cx="85" cy="54" r="8" fill="#ddb292"/>
      </g>
      {/* Engineer silhouette */}
      <g transform="translate(138 297)">
        <path d="M51 74c-23 2-35 25-40 53L0 226h146l-20-108c-6-27-26-41-49-44z" fill="#444b4b"/>
        <path d="M50 72c-20 4-34 21-38 54L7 205l69 12 64-17-17-77c-9-32-26-45-47-51z" fill="url(#pp-login-vest)"/>
        <path d="m49 73 23 92-10 40M85 73 72 165l14 42" stroke="#ffd3a6" strokeWidth="10"/>
        <path d="M48 60V83l23 20 22-22V58" fill="#e7a074"/>
        <path d="M42 38c0-27 40-34 52-7v24c-9 19-27 22-45 11z" fill="#de9f73"/>
        <path d="M42 38c0-28 52-39 57 0H42Z" fill="#fd993f"/>
        <path d="M32 38h78l-4 10H34z" fill="#e97723"/>
        <path d="M54 33v-15l8-7 21 1 8 12v9" stroke="#f9b773" strokeWidth="3"/>
        <path d="M6 214h137" stroke="#c78350" strokeWidth="6"/>
        <path d="M14 136l52 26 19-18 11 10-27 40-63-28" fill="#e4a277"/>
        <path d="m85 142 41-14 23 47-39 18z" fill="#40484a"/>
        <path d="m93 147 31-9 16 34-32 12z" fill="#e8f0f1"/>
        <path d="m107 155 14 8m-17 3 18 10" stroke="#f58c40" strokeWidth="2"/>
      </g>
      <path d="M0 500h880" stroke="#f4a36b" strokeWidth="4" opacity=".5"/>
      <g fill="#eba26a" opacity=".55"><circle cx="93" cy="471" r="13"/><circle cx="75" cy="479" r="20"/><circle cx="860" cy="477" r="17"/><circle cx="845" cy="491" r="21"/></g>
      <g className="pp-login-scene-spark" fill="#f78835"><circle cx="650" cy="87" r="5"/><circle cx="675" cy="101" r="3"/><circle cx="619" cy="116" r="3"/></g>
    </svg>
  );
}

const features: { title: string; detail: string; icon: LoginIcon; className: string }[] = [
  { title: 'CRM', detail: 'Leads & follow-ups', icon: 'users', className: 'pp-login-badge-crm' },
  { title: 'Quotations', detail: 'Packages & estimates', icon: 'file', className: 'pp-login-badge-quote' },
  { title: 'Site Execution', detail: 'Track progress', icon: 'chart', className: 'pp-login-badge-site' },
  { title: 'Procurement', detail: 'Materials & orders', icon: 'package', className: 'pp-login-badge-procurement' },
  { title: 'Finance', detail: 'Payments & invoices', icon: 'wallet', className: 'pp-login-badge-finance' },
  { title: 'Client Portal', detail: 'Keep clients informed', icon: 'users', className: 'pp-login-badge-client' },
];

function PhoneIllustration() {
  return (
    <div className="pp-login-phone" aria-hidden="true">
      <div className="pp-login-phone-notch"/>
      <div className="pp-login-phone-content">
        <div className="pp-login-phone-brand"><SymbolIcon name="home" size={19}/><b>ProPulse</b></div>
        <strong>Welcome back</strong><span>Sign in to your workspace</span>
        <div className="pp-login-phone-field"><span className="pp-login-phone-google">G</span> Continue with Google</div>
        <div className="pp-login-phone-field"><SymbolIcon name="home" size={12}/> Continue with ProPulse</div>
        <small>or continue with email</small>
        <div className="pp-login-phone-input">✉ &nbsp; Enter your email</div>
        <div className="pp-login-phone-input">♙ &nbsp; •••••••••</div>
        <div className="pp-login-phone-submit">Sign in <SymbolIcon name="arrow" size={11}/></div>
        <div className="pp-login-phone-scene"><ConstructionIllustration/></div>
      </div>
    </div>
  );
}

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{
    recovery?: string;
    provider_error?: string;
    confirmation?: string;
  }>;
}) {
  const params = await searchParams;
  const recoveryComplete = params.recovery === 'complete';
  if (!recoveryComplete && isSupabaseConfigured()) {
    const db = await createServerDatabase();
    const { data } = await db.auth.getUser();
    if (data.user) {
      const destination = await resolveLoginDestination(db, data.user.id);
      redirect(
        new URL(destination, publicAuthOrigin('http://localhost:3000/login')).toString(),
      );
    }
  }

  const configured = isSupabaseConfigured();
  const alert =
    params.provider_error && notices[params.provider_error]
      ? notices[params.provider_error]
      : params.confirmation === 'failed'
        ? notices.callback
        : '';

  return (
    <main id="main-content" tabIndex={-1} className="pp-login">
      <div className="pp-login-frame">
        <section className="pp-login-showcase" aria-labelledby="pp-login-story-title">
          <a href="/" className="pp-login-story-brand" aria-label="ProPulse Business OS home"><Brand/></a>
          <div className="pp-login-story-middle">
            <p className="pp-login-story-eyebrow">CONSTRUCTION &amp; INTERIOR BUSINESS OS</p>
            <h2 id="pp-login-story-title">Welcome back to<br/><span>smarter project management.</span></h2>
            <p className="pp-login-story-description">Manage leads, quotations, sites, payments and clients in one place.</p>
          </div>
          <div className="pp-login-illustration" aria-hidden="true">
            <svg className="pp-login-flow pp-login-flow-left" viewBox="0 0 340 370" fill="none" aria-hidden="true">
              <path d="M36 80C30 142 42 166 117 174S206 241 265 295" stroke="#f77b27" strokeWidth="2" strokeDasharray="5 7" strokeLinecap="round"/>
              <circle cx="36" cy="80" r="5" fill="#f77924"/><circle cx="265" cy="295" r="5" fill="#f77924"/>
            </svg>
            <svg className="pp-login-flow pp-login-flow-right" viewBox="0 0 340 370" fill="none" aria-hidden="true">
              <path d="M260 45C260 118 209 137 135 154S56 230 73 302" stroke="#f77b27" strokeWidth="2" strokeDasharray="5 7" strokeLinecap="round"/>
              <circle cx="260" cy="45" r="5" fill="#f77924"/><circle cx="73" cy="302" r="5" fill="#f77924"/>
            </svg>
            <ConstructionIllustration/>
            {features.map(item=>(
              <div key={item.title} className={'pp-login-feature-badge ' + item.className}>
                <span><SymbolIcon name={item.icon} size={25}/></span>
                <div><strong>{item.title}</strong><small>{item.detail}</small></div>
              </div>
            ))}
          </div>
          <div className="pp-login-showcase-bottom"><span><SymbolIcon name="check" size={14}/> One connected workspace</span><span><SymbolIcon name="check" size={14}/> Built for site teams</span></div>
        </section>

        <section className="pp-login-right" aria-labelledby="login-title">
          <a className="pp-login-back-link" href="/"><SymbolIcon name="arrow" size={17}/> Back to home</a>
          <div className="pp-login-card">
            <div className="pp-login-card-brand"><Brand/></div>
            <div className="pp-login-intro"><h1 id="login-title">Welcome back</h1><p>Sign in to your Business OS workspace</p></div>

            {recoveryComplete && (
              <p className="pp-login-notice pp-login-success" role="status">
                Your password was updated successfully. Sign in with the new password.
              </p>
            )}
            {!configured && (
              <p className="pp-login-notice" role="status">
                Authentication setup is required before sign-in is available.
              </p>
            )}
            {alert && <p className="pp-login-notice" role="alert">{alert}</p>}

            <div className="pp-login-providers" aria-label="Single sign-on options">
              <a href="/auth/google" className="pp-login-provider"><span className="pp-login-google" aria-hidden="true">G</span><strong>Continue with Google</strong></a>
              <a href="/auth/propulse" className="pp-login-provider"><span className="pp-login-provider-house"><SymbolIcon name="home" size={26}/></span><strong>Continue with ProPulse</strong></a>
            </div>
            <div className="pp-login-divider"><span/><strong>or continue with email</strong><span/></div>
            <PremiumLoginForm action={signIn}/>
            <div className="pp-login-trust"><span className="pp-login-trust-icon"><SymbolIcon name="shield" size={23}/></span><span><strong>Secure company and employee access</strong><small>Protected sign-in with workspace and role-based permissions.</small></span></div>
          </div>
          <PhoneIllustration/>
          <p className="pp-login-copyright">© 2026 ProPulse Business OS</p>
        </section>
      </div>
    </main>
  );
}
