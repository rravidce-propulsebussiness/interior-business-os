/* eslint-disable @next/next/no-html-link-for-pages -- Fresh document navigation prevents incomplete React Flight responses on Hostinger. */
import { signOut } from '@business-os/auth/actions';
import { redirect } from 'next/navigation';
import {
  createServerDatabase,
  isSupabaseConfigured,
} from '@business-os/database/server';
import './home-landing.css';

export const dynamic = 'force-dynamic';

type HomeGlyph =
  | 'home'
  | 'chevron'
  | 'arrow'
  | 'people'
  | 'file'
  | 'briefcase'
  | 'receipt'
  | 'store'
  | 'cart'
  | 'chart'
  | 'shield'
  | 'check'
  | 'search'
  | 'menu'
  | 'quote'
  | 'building'
  | 'calendar'
  | 'bell'
  | 'sparkle'
  | 'truck'
  | 'layers'
  | 'user';

const strokes: Record<HomeGlyph, string> = {
  home: 'M3 11.5 12 4l9 7.5M5.5 10V21H18.5V10M9 21v-6h6v6',
  chevron: 'm8 10 4 4 4-4',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  people:
    'M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2m13-12a4 4 0 0 0-8 0 4 4 0 0 0 8 0ZM22 21v-2a4 4 0 0 0-3-3.87M18 5.13A4 4 0 0 1 18 13',
  file: 'M6 2h9l5 5v15H6zM15 2v6h5M9 12h7M9 16h7',
  briefcase: 'M3 7h18v14H3zM8 7V4h8v3M3 13h18M10 13v2h4v-2',
  receipt: 'M5 2h14v20l-3-2-4 2-4-2-3 2zM9 8h6M9 12h6M9 16h4',
  store: 'M4 9h16l-1-6H5zM4 9v12h16V9M9 21v-8h6v8',
  cart: 'M3 4h2l3 12h12l2-9H6M10 21h.01M19 21h.01',
  chart: 'M4 19V12M10 19V5M16 19v-9M22 19V2M2 22h20',
  shield: 'M12 2 4 6v6c0 5 3.5 8 8 10 4.5-2 8-5 8-10V6zM8.5 12l2.5 2.5 4.5-5',
  check: 'm4 12 5 5L20 6',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm6-2 5 5',
  menu: 'M4 7h16M4 12h16M4 17h16',
  quote: 'M4 3h16v15H9l-5 4zM8 9h8M8 13h6',
  building: 'M3 22V6l9-4 9 4v16M8 10h2M14 10h2M8 15h2M14 15h2M9 22v-4h6v4',
  calendar: 'M3 5h18v16H3zM7 2v6M17 2v6M3 10h18',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4',
  sparkle: 'm12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z',
  truck:
    'M3 6h12v12H3zM15 10h4l3 4v4h-7M7 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4M19 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4',
  layers: 'm12 2 10 6-10 6L2 8zM2 12l10 6 10-6M2 16l10 6 10-6',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 22v-3a8 8 0 0 1 16 0v3',
};

function Glyph({ name, size = 20 }: { name: HomeGlyph; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
    >
      <path d={strokes[name]} />
    </svg>
  );
}

const tools = [
  {
    name: 'CRM & Leads',
    body: 'Capture enquiries, track follow-ups and convert more projects.',
    icon: 'people' as const,
    accent: 'blue',
  },
  {
    name: 'Quotations',
    body: 'Prepare professional estimates, packages and revisions.',
    icon: 'quote' as const,
    accent: 'violet',
  },
  {
    name: 'Projects & Site Updates',
    body: 'Track progress, share updates and manage execution.',
    icon: 'briefcase' as const,
    accent: 'green',
  },
  {
    name: 'GST Billing',
    body: 'Prepare GST-ready invoices and stay organized.',
    icon: 'receipt' as const,
    accent: 'orange',
  },
  {
    name: 'B2B Marketplace',
    body: 'Source materials from approved business suppliers.',
    icon: 'store' as const,
    accent: 'pink',
  },
];

const categories = [
  {
    title: 'Plywood & Boards',
    details: 'Plywood, MDF, HDF, particle board and more',
    visual: 'wood',
  },
  {
    title: 'Tiles & Surfaces',
    details: 'Floor tiles, wall tiles, marble and granite',
    visual: 'tiles',
  },
  {
    title: 'Cement & Steel',
    details: 'Cement, TMT bars and construction supplies',
    visual: 'cement',
  },
  {
    title: 'Hardware & Fittings',
    details: 'Cabinet hardware, hinges, handles and fittings',
    visual: 'hardware',
  },
];

export default async function Home() {
  // Do not infer authentication from the presence of a cookie. This is a
  // verified session check and the result is never shared between requests.
  const {
    data: { user },
  } = isSupabaseConfigured()
    ? await (await createServerDatabase()).auth.getUser()
    : { data: { user: null } };
  // A verified session owns a workspace, not the public marketing homepage.
  // /dashboard already routes authorized platform admins to /admin and
  // resolves business memberships (including slug-based workspaces).
  // Keep this redirect server-side and request-scoped: no stale cookie
  // inference or client-side Flash of the public marketing page.
  if (user) redirect('/dashboard');

  const signedIn = false;
  const workspaceHref = signedIn ? '/dashboard' : '/login';
  const marketHref = signedIn ? '/dashboard/marketplace' : '/login';
  const sellerHref = signedIn ? '/dashboard/marketplace/seller' : '/register';

  return (
    <main id="main-content" tabIndex={-1} className="pp-home">
      <header className="pp-topbar" aria-label="Site header">
        <div className="pp-topbar-inner">
          <a
            href="/"
            className="pp-brand"
            aria-label="ProPulse Business OS home"
          >
            <span className="pp-brand-symbol">
              <Glyph name="home" size={30} />
            </span>
            <span>
              <strong>ProPulse</strong>
              <small>Business OS</small>
            </span>
          </a>

          <nav aria-label="Main navigation" className="pp-main-nav">
            <a href="#features">
              Features <Glyph name="chevron" size={13} />
            </a>
            <a href="#marketplace">Marketplace</a>
            <a href="#for-businesses">
              For Businesses <Glyph name="chevron" size={13} />
            </a>
            <a href="#for-sellers">
              For Sellers <Glyph name="chevron" size={13} />
            </a>
            <a href="#how-it-works">How It Works</a>
          </nav>

          <div className="pp-header-right">
            {signedIn ? (
              <nav aria-label="Your account" className="pp-account-nav">
                <span className="pp-signed-in" title={user?.email ?? undefined}>
                  Signed in{user?.email ? ' · ' + user.email : ''}
                </span>
                <a className="pp-header-login" href="/dashboard">
                  Dashboard
                </a>
                <form action={signOut}>
                  <button className="pp-header-signup" type="submit">
                    Sign out <Glyph name="arrow" size={15} />
                  </button>
                </form>
              </nav>
            ) : (
              <nav aria-label="Account navigation" className="pp-account-nav">
                <a href="/login" className="pp-header-login">
                  Sign in
                </a>
                <a href="/register" className="pp-header-signup">
                  Sign Up <Glyph name="arrow" size={15} />
                </a>
              </nav>
            )}
            <details className="pp-mobile-nav">
              <summary aria-label="Open site menu">
                <Glyph name="menu" size={23} />
              </summary>
              <div className="pp-mobile-popover">
                <a href="#features">Features</a>
                <a href="#marketplace">Marketplace</a>
                <a href="#for-businesses">For Businesses</a>
                <a href="#for-sellers">For Sellers</a>
                <a href="#how-it-works">How It Works</a>
                <span className="pp-mobile-divider" />
                {signedIn ? (
                  <>
                    <a href="/dashboard">Dashboard</a>
                    <form action={signOut}>
                      <button type="submit">Sign out</button>
                    </form>
                  </>
                ) : (
                  <>
                    <a href="/login">Sign in</a>
                    <a href="/register">Sign Up</a>
                  </>
                )}
              </div>
            </details>
          </div>
        </div>
      </header>

      <section className="pp-hero" aria-labelledby="pp-home-title">
        <div className="pp-hero-inner">
          <div className="pp-hero-copy">
            <p className="pp-overline">
              India&apos;s construction &amp; interior business operating system
            </p>
            <h1 id="pp-home-title">
              Run your business.
              <br />
              <span>Source smarter.</span> Grow faster.
            </h1>
            <p className="pp-hero-description">
              Everything from leads to quotations, projects, GST billing and
              materials — in one workspace.
            </p>
            <div className="pp-hero-actions">
              <a
                className="pp-btn pp-btn-primary"
                href={signedIn ? '/dashboard' : '/register'}
              >
                {signedIn ? 'Open Your Dashboard' : 'Start Your Business'}{' '}
                <Glyph name="arrow" size={19} />
              </a>
              <a className="pp-btn pp-btn-outline" href="#marketplace">
                Explore Marketplace <Glyph name="arrow" size={19} />
              </a>
            </div>
            {signedIn ? (
              <a href="/dashboard" className="pp-hero-login-hint">
                Continue to your workspace <Glyph name="arrow" size={14} />
              </a>
            ) : (
              <a href="/login" className="pp-hero-login-hint">
                Already have an account? Sign in to your workspace{' '}
                <Glyph name="arrow" size={14} />
              </a>
            )}
            <div
              className="pp-benefit-strip"
              aria-label="What ProPulse helps you do"
            >
              <div>
                <Glyph name="people" size={19} />
                <span>
                  Manage enquiries
                  <br />
                  and leads
                </span>
              </div>
              <div>
                <Glyph name="briefcase" size={19} />
                <span>
                  Run projects
                  <br />
                  end to end
                </span>
              </div>
              <div>
                <Glyph name="file" size={19} />
                <span>
                  Create GST-ready
                  <br />
                  invoices
                </span>
              </div>
              <div>
                <Glyph name="cart" size={19} />
                <span>
                  Source business
                  <br />
                  materials
                </span>
              </div>
            </div>
          </div>

          <div
            className="pp-hero-art"
            aria-label="Illustrative view of the ProPulse Business OS dashboard"
          >
            <div className="pp-hero-photo" aria-hidden="true" />
            <div className="pp-hero-glow" aria-hidden="true" />
            <div className="pp-screen">
              <div className="pp-screen-sidebar">
                <div className="pp-screen-brand">
                  <Glyph name="home" size={15} />
                  <span>
                    <strong>ProPulse</strong>
                    <small>Business OS</small>
                  </span>
                </div>
                {(
                  [
                    ['home', 'Dashboard'],
                    ['people', 'Leads'],
                    ['file', 'Quotations'],
                    ['briefcase', 'Projects'],
                    ['user', 'Clients'],
                    ['store', 'Marketplace'],
                    ['receipt', 'Billing'],
                    ['chart', 'Reports'],
                  ] as const
                ).map(([icon, title], i) => (
                  <div
                    key={title}
                    className={
                      'pp-screen-menu-item' +
                      (i === 0 ? ' pp-screen-selected' : '')
                    }
                  >
                    <Glyph name={icon} size={13} /> {title}
                  </div>
                ))}
              </div>
              <div className="pp-screen-body">
                <div className="pp-screen-top">
                  <div className="pp-screen-search">
                    <Glyph name="search" size={12} /> Search leads, projects,
                    materials…
                  </div>
                  <Glyph name="bell" size={15} />
                </div>
                <div className="pp-screen-preview-label">
                  <Glyph name="sparkle" size={12} /> Illustrative workspace
                  preview
                </div>
                <h2>Welcome back!</h2>
                <p>See your operations in one place.</p>
                <div className="pp-screen-metrics">
                  <div>
                    <span className="pp-demo-icon pp-demo-blue">
                      <Glyph name="people" size={14} />
                    </span>
                    <small>New leads</small>
                    <strong>12</strong>
                  </div>
                  <div>
                    <span className="pp-demo-icon pp-demo-green">
                      <Glyph name="file" size={14} />
                    </span>
                    <small>Quotations</small>
                    <strong>8</strong>
                  </div>
                  <div>
                    <span className="pp-demo-icon pp-demo-purple">
                      <Glyph name="briefcase" size={14} />
                    </span>
                    <small>Projects</small>
                    <strong>5</strong>
                  </div>
                  <div>
                    <span className="pp-demo-icon pp-demo-orange">
                      <Glyph name="receipt" size={14} />
                    </span>
                    <small>Invoices</small>
                    <strong>3</strong>
                  </div>
                </div>
                <div className="pp-screen-mid">
                  <div className="pp-screen-lead-table">
                    <strong>Recent enquiries</strong>
                    <div className="pp-demo-table-row pp-demo-table-heading">
                      <span>Requirement</span>
                      <span>Status</span>
                    </div>
                    <div className="pp-demo-table-row">
                      <span>3 BHK Interiors</span>
                      <em>New</em>
                    </div>
                    <div className="pp-demo-table-row">
                      <span>Home Construction</span>
                      <em className="pp-demo-amber">Follow-up</em>
                    </div>
                    <div className="pp-demo-table-row">
                      <span>Office Renovation</span>
                      <em className="pp-demo-green-chip">Quoted</em>
                    </div>
                  </div>
                  <div className="pp-screen-progress">
                    <strong>Project updates</strong>
                    <div className="pp-demo-progress">68%</div>
                    <div className="pp-demo-progress-row">
                      <i /> In progress
                    </div>
                    <div className="pp-demo-progress-row">
                      <i /> Planning
                    </div>
                    <div className="pp-demo-progress-row">
                      <i /> Completed
                    </div>
                  </div>
                </div>
                <div className="pp-screen-thumbnails" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            </div>
            <div className="pp-material-hero-tiles" aria-hidden="true">
              <span className="pp-swatch-tile pp-swatch-wood" />
              <span className="pp-swatch-tile pp-swatch-stone" />
              <span className="pp-swatch-tile pp-swatch-metal" />
            </div>
            <div className="pp-marketplace-tag">
              <Glyph name="store" size={23} />
              <strong>ProPulse</strong>
              <small>Marketplace</small>
            </div>
          </div>
        </div>
      </section>

      <section
        id="features"
        className="pp-features pp-content-section"
        aria-labelledby="pp-features-title"
      >
        <div className="pp-section-heading">
          <h2 id="pp-features-title">Your business, one connected platform</h2>
          <p>
            Powerful tools to manage your entire construction and interior
            business.
          </p>
        </div>
        <div className="pp-feature-grid">
          {tools.map((item, index) => (
            <a className="pp-feature-card" href={workspaceHref} key={item.name}>
              <div className="pp-feature-head">
                <span className={'pp-feature-icon pp-accent-' + item.accent}>
                  <Glyph name={item.icon} size={24} />
                </span>
                <div>
                  <h3>{item.name}</h3>
                  <p>{item.body}</p>
                </div>
              </div>
              <div
                className={'pp-feature-mini pp-feature-mini-' + index}
                aria-hidden="true"
              >
                {index === 0 && (
                  <div className="pp-mini-lead">
                    <span>SP</span>
                    <div>
                      <strong>New enquiry</strong>
                      <small>3 BHK Interior · New</small>
                    </div>
                    <em>New</em>
                  </div>
                )}
                {index === 1 && (
                  <div className="pp-mini-quotation">
                    <span className="pp-photo-interior" />
                    <div>
                      <strong>Interior package</strong>
                      <small>Estimate &amp; scope</small>
                      <i />
                    </div>
                    <Glyph name="file" size={20} />
                  </div>
                )}
                {index === 2 && (
                  <div className="pp-mini-project">
                    <span className="pp-photo-project" />
                    <div>
                      <i />
                      <i />
                      <i />
                      <i />
                    </div>
                  </div>
                )}
                {index === 3 && (
                  <div className="pp-mini-invoice">
                    <strong>Tax invoice</strong>
                    <small>Draft · GST-ready</small>
                    <span>₹</span>
                    <em>Review</em>
                  </div>
                )}
                {index === 4 && (
                  <div className="pp-mini-materials">
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                )}
              </div>
            </a>
          ))}
        </div>
      </section>

      <section
        id="marketplace"
        className="pp-marketplace pp-content-section"
        aria-labelledby="pp-marketplace-title"
      >
        <div className="pp-marketplace-header">
          <div>
            <p className="pp-overline">One place to source for your projects</p>
            <h2 id="pp-marketplace-title">
              Explore the B2B Materials Marketplace
            </h2>
            <p>
              Discover construction and interior material categories, then
              connect with business suppliers.
            </p>
          </div>
          <a className="pp-btn pp-btn-small-outline" href={marketHref}>
            Browse Marketplace <Glyph name="arrow" size={16} />
          </a>
        </div>
        <div className="pp-marketplace-grid">
          {categories.map((category) => (
            <a
              className="pp-material-card"
              href={marketHref}
              key={category.title}
            >
              <span
                aria-hidden="true"
                className={'pp-material-photo pp-material-' + category.visual}
              />
              <span className="pp-material-info">
                <strong>{category.title}</strong>
                <small>{category.details}</small>
              </span>
              <span className="pp-material-arrow">
                <Glyph name="arrow" size={17} />
              </span>
            </a>
          ))}
        </div>
        <p className="pp-marketplace-notice">
          Material categories are illustrative. Actual listings and seller rates
          are visible to authorized business accounts; purchase requests are
          subject to supplier acceptance.
        </p>
      </section>

      <section
        className="pp-audience pp-content-section"
        aria-label="For business owners and suppliers"
      >
        <article className="pp-audience-card pp-owner-cta" id="for-businesses">
          <div className="pp-audience-art pp-owner-art" aria-hidden="true" />
          <div className="pp-audience-content">
            <span className="pp-audience-icon">
              <Glyph name="people" size={25} />
            </span>
            <div>
              <p>For business owners</p>
              <h2>
                Manage everything yourself
                <br />
                or give employees access.
              </h2>
              <span>
                Leads, quotations, projects, billing and material sourcing — all
                in one place.
              </span>
            </div>
            <a
              href={signedIn ? '/dashboard' : '/register'}
              className="pp-audience-link"
            >
              {signedIn ? 'Open Dashboard' : 'Get Started'}{' '}
              <Glyph name="arrow" size={15} />
            </a>
          </div>
        </article>
        <article className="pp-audience-card pp-seller-cta" id="for-sellers">
          <div className="pp-audience-art pp-seller-art" aria-hidden="true" />
          <div className="pp-audience-content">
            <span className="pp-audience-icon">
              <Glyph name="store" size={25} />
            </span>
            <div>
              <p>For sellers</p>
              <h2>
                List your materials
                <br />
                and grow your business.
              </h2>
              <span>
                Reach construction and interior businesses. Seller approval is
                required to publish.
              </span>
            </div>
            <a href={sellerHref} className="pp-audience-link">
              {signedIn ? 'Seller Centre' : 'Apply to List'}{' '}
              <Glyph name="arrow" size={15} />
            </a>
          </div>
        </article>
      </section>

      <section
        className="pp-how pp-content-section"
        id="how-it-works"
        aria-labelledby="pp-how-title"
      >
        <div className="pp-section-heading">
          <p className="pp-overline">
            Simple setup, more time for your projects
          </p>
          <h2 id="pp-how-title">How ProPulse works</h2>
        </div>
        <div className="pp-how-grid">
          <article>
            <span>01</span>
            <Glyph name="user" size={23} />
            <h3>Create your account</h3>
            <p>Sign up or accept an invitation to a business workspace.</p>
          </article>
          <article>
            <span>02</span>
            <Glyph name="layers" size={23} />
            <h3>Open your workspace</h3>
            <p>Access the modules enabled for your company and role.</p>
          </article>
          <article>
            <span>03</span>
            <Glyph name="truck" size={23} />
            <h3>Manage &amp; source</h3>
            <p>
              Run daily operations or send purchase requests to approved
              sellers.
            </p>
          </article>
        </div>
      </section>

      <footer className="pp-footer">
        <div className="pp-footer-inner">
          <a className="pp-brand pp-footer-brand" href="/">
            <span className="pp-brand-symbol">
              <Glyph name="home" size={24} />
            </span>
            <span>
              <strong>ProPulse</strong>
              <small>Business OS</small>
            </span>
          </a>
          <p>Business operations and B2B material sourcing, connected.</p>
          <nav aria-label="Footer navigation">
            <a href="#features">Features</a>
            <a href="#marketplace">Marketplace</a>
            <a href="/login">Login</a>
            <a href="/register">Sign Up</a>
          </nav>
        </div>
      </footer>
    </main>
  );
}
