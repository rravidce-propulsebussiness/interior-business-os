/* eslint-disable @next/next/no-html-link-for-pages -- Keep full document navigation for Hostinger auth and workspace transitions. */
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import {
  createServerDatabase,
  isSupabaseConfigured,
} from '@business-os/database/server';
import './home-landing.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'ProPulse Business OS | Construction CRM & Project Management',
  description:
    'Manage construction and interior leads, quotations, project timelines, site quality checks, procurement, finance and client updates in one workspace.',
  alternates: { canonical: 'https://sghomesinterior.in/' },
  robots: { index: true, follow: true },
};

type IconName =
  | 'home'
  | 'menu'
  | 'arrow'
  | 'chevron'
  | 'users'
  | 'file'
  | 'project'
  | 'cart'
  | 'wallet'
  | 'shield'
  | 'check'
  | 'calendar'
  | 'building'
  | 'chart'
  | 'bell'
  | 'search'
  | 'clipboard'
  | 'settings'
  | 'camera'
  | 'clock'
  | 'truck'
  | 'user'
  | 'spark'
  | 'layers'
  | 'target'
  | 'store'
  | 'phone'
  | 'pin'
  | 'hardhat'
  | 'link'
  | 'lock';

const iconPaths: Record<IconName, string> = {
  home: 'M3 11.5 12 4l9 7.5M5.5 10V21h13V10M9 21v-6h6v6',
  menu: 'M4 7h16M4 12h16M4 17h16',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  chevron: 'm9 18 6-6-6-6',
  users:
    'M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M17 3.13a4 4 0 0 1 0 7.75',
  file: 'M6 2h9l5 5v15H6zM15 2v6h5M9 12h8M9 16h8',
  project: 'M3 4h18v16H3zM3 10h18M9 10v10M15 10v10',
  cart: 'M2 4h3l3 12h12l2-9H6M10 21h.01M19 21h.01',
  wallet: 'M3 6h18v15H3zM3 6V3h16M15 12h6v5h-6z',
  shield: 'M12 2 4 6v6c0 5 3.5 8 8 10 4.5-2 8-5 8-10V6zM8 12l3 3 5-6',
  check: 'm4 12 5 5L20 6',
  calendar: 'M3 5h18v16H3zM7 2v6M17 2v6M3 10h18',
  building: 'M3 22V6l9-4 9 4v16M8 10h2M14 10h2M8 15h2M14 15h2M9 22v-4h6v4',
  chart: 'M3 19l5-6 4 3 8-11M3 22h18',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm6-2 5 5',
  clipboard: 'M8 4h8M9 2h6l1 4H8zM6 4H4v18h16V4h-2M8 12h8M8 16h6',
  settings:
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM4 12l-2-2 2-4 3 1 2-3h6l2 3 3-1 2 4-2 2 2 2-2 4-3-1-2 3H9l-2-3-3 1-2-4z',
  camera: 'M3 7h5l2-3h4l2 3h5v13H3zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 6v6l4 3',
  truck:
    'M3 6h12v12H3zM15 10h4l3 4v4h-7M7 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4M19 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 22v-3a8 8 0 0 1 16 0v3',
  spark: 'm12 2 2 8 8 2-8 2-2 8-2-8-8-2 8-2',
  layers: 'm12 2 10 6-10 6L2 8zM2 12l10 6 10-6M2 16l10 6 10-6',
  target:
    'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM12 12h.01',
  store: 'M4 9h16l-1-6H5zM4 9v12h16V9M9 21v-8h6v8',
  phone: 'M6 2h12v20H6zM10 18h4',
  pin: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4',
  hardhat: 'M3 16h18M5 16v-3a7 7 0 0 1 14 0v3M9 6v10M15 6v10M2 19h20',
  link: 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2',
  lock: 'M5 11h14v11H5zM8 11V7a4 4 0 0 1 8 0v4',
};

function Icon({
  name,
  size = 20,
  className = '',
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={iconPaths[name]} />
    </svg>
  );
}

function Brand() {
  return (
    <span className="pp-brand">
      <span className="pp-brand-mark" aria-hidden="true">
        <Icon name="home" size={29} />
      </span>
      <span>
        <strong>ProPulse</strong>
        <small>BUSINESS OS</small>
      </span>
    </span>
  );
}

/** Decorative, original SVG. The motion is disabled for reduced-motion users. */
function SiteIllustration({ className = '' }: { className?: string }) {
  return (
    <svg
      className={'pp-site-illustration ' + className}
      viewBox="0 0 660 300"
      fill="none"
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="xMidYMax meet"
    >
      <path
        d="M0 225Q160 178 320 228T660 214V300H0Z"
        fill="#ffe6d1"
        opacity=".75"
      />
      <g stroke="#f9a36a" strokeWidth="2" strokeLinejoin="round" opacity=".82">
        <path d="M69 246V109h80v137M80 109V83h64v26M83 142h54M83 171h54M83 199h54M112 109v137" />
        <path d="M190 252V148h129v104M202 148V120h105v28M202 179h105M202 211h105M230 148v104M273 148v104" />
        <path d="M336 249V76h136v173M350 76V52h111v24M352 111h109M352 149h109M352 187h109M382 76v173M428 76v173" />
        <path d="M505 250V162h94v88M515 162v-19h74v19M515 194h74M515 223h74M549 162v88" />
        <path d="M26 240V30M8 56h175M26 30h92M118 30v26M26 81l92-51M70 56v184M17 56h18M117 56h18" />
        <path d="M10 30h30l-15-13zM166 56l13 10h-13zM7 256h625" />
      </g>
      <g
        className="pp-crane-hook"
        stroke="#f26a18"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <path d="M172 56v52m-7 0h14m-7 0v8" />
      </g>
      <g stroke="#ffd0b3" strokeWidth="1.5" opacity=".9">
        <path d="M0 273h660M13 283h182M226 282h180M443 284h202" />
      </g>
      <circle
        className="pp-svg-orbit"
        cx="580"
        cy="71"
        r="20"
        stroke="#ffb986"
        strokeDasharray="5 6"
        strokeWidth="2"
      />
      <path
        className="pp-draw-path"
        d="M500 115C535 45 586 41 635 20"
        stroke="#ff741a"
        strokeWidth="2"
        strokeDasharray="6 7"
        strokeLinecap="round"
      />
      <path
        d="m624 16 12 4-5 11"
        stroke="#ff741a"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const navLinks = [
  { title: 'Features', href: '#features' },
  { title: 'Solutions', href: '#solutions' },
  { title: 'Marketplace', href: '#marketplace' },
  { title: 'How It Works', href: '#how-it-works' },
  { title: 'Contact', href: 'mailto:info@propulsetechnologies.online' },
];

const capabilities = [
  {
    title: 'CRM & Lead Pipeline',
    description:
      'Capture, assign and follow up on every enquiry until it becomes a project.',
    icon: 'users' as const,
  },
  {
    title: 'Quotations & Packages',
    description:
      'Create detailed estimates, edit brands and share professional quotations.',
    icon: 'file' as const,
  },
  {
    title: 'Projects & Site Execution',
    description:
      'Plan overlapping stages, daily work, approvals and construction progress.',
    icon: 'building' as const,
  },
  {
    title: 'Material Procurement',
    description:
      'Plan site requirements, approve orders and track deliveries and usage.',
    icon: 'cart' as const,
  },
  {
    title: 'Finance & Invoicing',
    description:
      'Manage stage payments, invoices, receipts, expenses and tax records.',
    icon: 'wallet' as const,
  },
  {
    title: 'Client Portal',
    description:
      'Share approved updates, project photos, milestones and payment requests.',
    icon: 'phone' as const,
  },
];

const projectStages = [
  { name: 'Planning', progress: 93 },
  { name: 'Design approval', progress: 77 },
  { name: 'Foundation', progress: 68 },
  { name: 'RCC & masonry', progress: 40 },
  { name: 'Finishes', progress: 20 },
];

const workflow = [
  { label: 'Enquiry', sub: 'Capture leads', icon: 'target' as const },
  { label: 'Planning & Design', sub: 'Approve scope', icon: 'layers' as const },
  { label: 'Procurement', sub: 'Request materials', icon: 'cart' as const },
  {
    label: 'Site Execution',
    sub: 'Track daily work',
    icon: 'hardhat' as const,
  },
  {
    label: 'Quality Checks',
    sub: 'Inspect & approve',
    icon: 'shield' as const,
  },
  { label: 'Handover', sub: 'Delight clients', icon: 'users' as const },
];

const roles = [
  {
    name: 'Business Owner',
    detail: 'Company-wide visibility and permissions',
    label: 'Owner',
  },
  {
    name: 'Project Manager',
    detail: 'Stage planning and approvals',
    label: 'Manager',
  },
  {
    name: 'Site Engineer',
    detail: 'Daily site reports, checks and materials',
    label: 'Site',
  },
  {
    name: 'Client',
    detail: 'Approved updates, documents and payments',
    label: 'Client',
  },
];

const materials = [
  { label: 'Cement & Steel', icon: 'building' as const, style: 'cement' },
  { label: 'Tiles & Surfaces', icon: 'layers' as const, style: 'tiles' },
  { label: 'Electrical & Lighting', icon: 'spark' as const, style: 'lighting' },
  { label: 'Wood & Hardware', icon: 'store' as const, style: 'wood' },
  { label: 'Paints & Finishes', icon: 'shield' as const, style: 'paint' },
];

function DashboardPreview() {
  return (
    <div
      className="pp-dashboard-scene"
      aria-label="Illustrative dashboard and mobile site update preview"
    >
      <div className="pp-dashboard-window">
        <aside className="pp-preview-sidebar">
          <div className="pp-preview-mini-brand">
            <span className="pp-preview-brand-icon">
              <Icon name="home" size={17} />
            </span>
            <b>ProPulse</b>
          </div>
          {(
            [
              ['home', 'Dashboard'],
              ['users', 'CRM'],
              ['file', 'Quotations'],
              ['project', 'Projects'],
              ['cart', 'Procurement'],
              ['wallet', 'Finance'],
              ['users', 'Team'],
              ['chart', 'Reports'],
              ['settings', 'Settings'],
            ] as const
          ).map(([icon, label], index) => (
            <div
              className={
                'pp-preview-menu-item ' + (index === 0 ? 'is-current' : '')
              }
              key={label}
            >
              <Icon name={icon} size={13} />
              <span>{label}</span>
            </div>
          ))}
        </aside>
        <div className="pp-preview-main">
          <div className="pp-preview-toolbar">
            <span>
              <Icon name="search" size={12} /> Search projects, leads...
            </span>
            <Icon name="bell" size={15} />
            <span className="pp-preview-avatar">P</span>
          </div>
          <div className="pp-preview-kicker">
            <Icon name="spark" size={12} /> Example workspace
          </div>
          <div className="pp-preview-heading">
            <div>
              <strong>Business Overview</strong>
              <small>Manage everything in one place</small>
            </div>
            <span>
              This month <Icon name="chevron" size={11} />
            </span>
          </div>
          <div className="pp-preview-kpis">
            {[
              ['New enquiries', '42', '+12%'],
              ['Active projects', '28', '+8%'],
              ['Stage payments', '₹18.4L', 'Tracked'],
              ['Progress', '78%', 'On track'],
            ].map(([name, value, trend]) => (
              <div key={name}>
                <small>{name}</small>
                <strong>{value}</strong>
                <em>{trend}</em>
              </div>
            ))}
          </div>
          <div className="pp-chart-card">
            <div className="pp-preview-card-title">
              <b>Project Progress</b>
              <span>
                <i /> Planned <i /> Actual
              </span>
            </div>
            <svg
              className="pp-chart-svg"
              viewBox="0 0 460 118"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <g stroke="#f5eae3" strokeWidth="1">
                <path d="M0 26H460M0 55H460M0 84H460M0 113H460" />
              </g>
              <path
                d="M1 95C45 88 71 101 109 75S171 91 215 57 285 72 338 40 400 45 459 14"
                stroke="#f76c19"
                strokeWidth="3"
                fill="none"
                strokeLinecap="round"
                className="pp-chart-line"
              />
              <path
                d="M1 103C49 96 80 102 109 87S177 89 218 74 284 78 343 59 407 62 458 41"
                stroke="#ffb47f"
                strokeWidth="2.5"
                fill="none"
                strokeDasharray="6 5"
                strokeLinecap="round"
              />
            </svg>
            <div className="pp-chart-months">
              <span>May</span>
              <span>Jun</span>
              <span>Jul</span>
              <span>Aug</span>
              <span>Sep</span>
              <span>Oct</span>
            </div>
          </div>
          <div className="pp-project-table">
            <div className="pp-preview-card-title">
              <b>Recent Projects</b>
              <span>
                View projects <Icon name="arrow" size={12} />
              </span>
            </div>
            <div className="pp-table-labels">
              <span>Project</span>
              <span>Stage</span>
              <span>Progress</span>
            </div>
            {[
              ['Modern Villa Interior', 'Execution', '80%'],
              ['Office Renovation', 'Procurement', '60%'],
              ['Luxury Residence', 'Design', '35%'],
            ].map(([name, stage, progress]) => (
              <div className="pp-table-row" key={name}>
                <b>{name}</b>
                <span>{stage}</span>
                <div className="pp-progress-track">
                  <i style={{ width: progress }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="pp-floating-phone" aria-hidden="true">
        <div className="pp-phone-top">
          <span className="pp-phone-dot" />
          <b>Site Update</b>
          <Icon name="bell" size={12} />
        </div>
        <div className="pp-phone-photo">
          <SiteIllustration />
        </div>
        <b>Foundation inspection</b>
        <small>Today's site report</small>
        <div className="pp-phone-checks">
          <span>
            <Icon name="check" size={11} /> Work updated
          </span>
          <span>
            <Icon name="check" size={11} /> Materials logged
          </span>
          <span>
            <Icon name="check" size={11} /> Quality checks
          </span>
        </div>
        <span className="pp-phone-button">
          Submit update <Icon name="arrow" size={11} />
        </span>
      </div>
      <div className="pp-hero-orbit pp-hero-orbit-one" aria-hidden="true">
        <Icon name="spark" size={19} />
      </div>
      <div className="pp-hero-orbit pp-hero-orbit-two" aria-hidden="true">
        <Icon name="check" size={19} />
      </div>
    </div>
  );
}

function FeatureMini({ index }: { index: number }) {
  switch (index) {
    case 0:
      return (
        <div className="pp-mini-board pp-mini-crm">
          {['New leads', 'Follow-up', 'Won'].map((title, i) => (
            <div key={title}>
              <small>{title}</small>
              <b>{[12, 8, 5][i]}</b>
              <span>
                {['Villa construction', '3 BHK interior', 'Office design'][i]}
              </span>
              <i />
            </div>
          ))}
        </div>
      );
    case 1:
      return (
        <div className="pp-mini-board pp-mini-quotes">
          <div>
            <span className="pp-mini-picture" />{' '}
            <span>
              <b>Residential Package</b>
              <small>₹24,50,000</small>
            </span>
            <Icon name="chevron" size={13} />
          </div>
          <div>
            <span className="pp-mini-picture" />{' '}
            <span>
              <b>Interior Package</b>
              <small>₹18,75,000</small>
            </span>
            <Icon name="chevron" size={13} />
          </div>
        </div>
      );
    case 2:
      return (
        <div className="pp-mini-board pp-mini-stages">
          {projectStages.slice(0, 4).map((stage) => (
            <div key={stage.name}>
              <span>{stage.name}</span>
              <i>
                <b style={{ width: stage.progress + '%' }} />
              </i>
            </div>
          ))}
        </div>
      );
    case 3:
      return (
        <div className="pp-mini-board pp-mini-orders">
          {['Requested', 'Approved', 'Ordered', 'Delivered'].map((step, i) => (
            <div key={step}>
              <span>
                <Icon name={i === 3 ? 'truck' : 'check'} size={14} />
              </span>
              <small>{step}</small>
            </div>
          ))}
        </div>
      );
    case 4:
      return (
        <div className="pp-mini-board pp-mini-invoices">
          <div>
            <Icon name="file" size={16} />
            <span>
              <b>Invoice INV-001</b>
              <small>₹4,50,000</small>
            </span>
            <em>Paid</em>
          </div>
          <div>
            <Icon name="file" size={16} />
            <span>
              <b>Invoice INV-002</b>
              <small>₹2,75,000</small>
            </span>
            <em>Pending</em>
          </div>
        </div>
      );
    default:
      return (
        <div className="pp-mini-board pp-mini-client">
          <span className="pp-mini-client-scene">
            <SiteIllustration />
          </span>
          <div>
            <strong>Latest site update</strong>
            <small>
              <Icon name="camera" size={12} /> Photos, progress & milestones
            </small>
            <span>
              View client portal <Icon name="arrow" size={12} />
            </span>
          </div>
        </div>
      );
  }
}

export default async function Home() {
  // A verified account goes to its existing workspace; the homepage remains public for visitors.
  const {
    data: { user },
  } = isSupabaseConfigured()
    ? await (await createServerDatabase()).auth.getUser()
    : { data: { user: null } };
  if (user) redirect('/dashboard');

  return (
    <main id="main-content" tabIndex={-1} className="pp-home">
      <header className="pp-topbar">
        <div className="pp-container pp-topbar-inner">
          <a href="/" aria-label="ProPulse Business OS home">
            <Brand />
          </a>
          <nav className="pp-main-nav" aria-label="Main navigation">
            {navLinks.map((item) => (
              <a key={item.title} href={item.href}>
                {item.title}
              </a>
            ))}
          </nav>
          <div className="pp-account-nav">
            <a href="/login" className="pp-login-btn">
              Login
            </a>
            <a href="/register" className="pp-btn pp-btn-primary pp-header-cta">
              Get Started <Icon name="arrow" size={16} />
            </a>
          </div>
          <details className="pp-mobile-nav">
            <summary aria-label="Open navigation">
              <Icon name="menu" size={22} />
            </summary>
            <nav aria-label="Mobile navigation">
              {navLinks.map((item) => (
                <a key={item.title} href={item.href}>
                  {item.title}
                </a>
              ))}
              <a href="/login">Login</a>
              <a href="/register">Get Started</a>
            </nav>
          </details>
        </div>
      </header>

      <section className="pp-hero" aria-labelledby="pp-home-title">
        <SiteIllustration className="pp-hero-architecture" />
        <div className="pp-container pp-hero-inner">
          <div className="pp-hero-copy">
            <span className="pp-eyebrow">
              <span className="pp-eyebrow-dot" /> BUILT FOR CONSTRUCTION &amp;
              INTERIOR BUSINESSES
            </span>
            <h1 id="pp-home-title">
              One platform.
              <br />
              Every project.
              <br />
              <span>Total control.</span>
            </h1>
            <p>
              Manage leads, win more work, deliver projects, control costs and
              keep clients happy — all in one simple platform built for
              construction and interior businesses.
            </p>
            <div className="pp-hero-actions">
              <a href="/register" className="pp-btn pp-btn-primary">
                Start Your Business <Icon name="arrow" size={17} />
              </a>
              <a href="#features" className="pp-btn pp-btn-outline">
                <Icon name="target" size={18} /> Explore Features
              </a>
            </div>
            <div className="pp-hero-points">
              <span>
                <Icon name="check" size={15} /> From enquiry to handover
              </span>
              <span>
                <Icon name="check" size={15} /> Designed for site teams
              </span>
              <span>
                <Icon name="check" size={15} /> Client visibility built in
              </span>
            </div>
          </div>
          <DashboardPreview />
        </div>
      </section>

      <div
        className="pp-container pp-value-ribbon"
        aria-label="Platform highlights"
      >
        {[
          ['target', 'Lead to handover', 'Complete project journey'],
          ['users', 'Multi-role access', 'Owners, teams & clients'],
          ['shield', 'Site reports & QC', 'Checks and approvals'],
          ['settings', 'One connected workspace', 'Work from anywhere'],
        ].map(([icon, title, subtitle]) => (
          <div key={title} className="pp-value-item">
            <span>
              <Icon name={icon as IconName} size={23} />
            </span>
            <div>
              <strong>{title}</strong>
              <small>{subtitle}</small>
            </div>
          </div>
        ))}
      </div>

      <section
        id="features"
        className="pp-container pp-section pp-features"
        aria-labelledby="pp-features-title"
      >
        <div className="pp-section-header">
          <div>
            <span className="pp-kicker">ALL-IN-ONE SOFTWARE</span>
            <h2 id="pp-features-title">Everything your business needs</h2>
            <p>
              From winning new business to project delivery, procurement,
              finance and client experience — connected.
            </p>
          </div>
          <a href="/register" className="pp-text-link">
            Get started <Icon name="arrow" size={16} />
          </a>
        </div>
        <div className="pp-feature-grid">
          {capabilities.map((item, index) => (
            <article key={item.title} className="pp-feature-card">
              <div className="pp-feature-top">
                <span className="pp-feature-icon">
                  <Icon name={item.icon} size={28} />
                </span>
                <span className="pp-card-arrow">
                  <Icon name="arrow" size={16} />
                </span>
              </div>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
              <FeatureMini index={index} />
            </article>
          ))}
        </div>
        <p className="pp-demo-note">
          Dashboard figures and project previews shown on this page are
          illustrative, not customer records.
        </p>
      </section>

      <section
        id="solutions"
        className="pp-section pp-process-section"
        aria-labelledby="pp-process-title"
      >
        <div className="pp-container">
          <div className="pp-section-header">
            <div>
              <span className="pp-kicker">BUILT FOR HOW SITES WORK</span>
              <h2 id="pp-process-title">
                Project management for real construction workflows
              </h2>
              <p>
                Agreement to handover — every work stage, site report, material
                request and approval in context.
              </p>
            </div>
            <a href="#how-it-works" className="pp-text-link">
              How it works <Icon name="arrow" size={16} />
            </a>
          </div>
          <div className="pp-workflow-rail" aria-label="Project lifecycle">
            <svg
              className="pp-workflow-line"
              viewBox="0 0 980 30"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path
                d="M0 15H980"
                stroke="#ffc8a6"
                strokeWidth="2"
                strokeDasharray="7 9"
              />
              <path
                className="pp-route-dash"
                d="M0 15H980"
                stroke="#f87523"
                strokeWidth="2"
                strokeDasharray="12 44"
              />
            </svg>
            {workflow.map((item) => (
              <div className="pp-workflow-step" key={item.label}>
                <span className="pp-workflow-node">
                  <Icon name={item.icon} size={22} />
                </span>
                <b>{item.label}</b>
                <small>{item.sub}</small>
              </div>
            ))}
          </div>
          <div className="pp-workflow-pills">
            {[
              ['clipboard', 'Stage-wise work & checklists'],
              ['cart', 'Material requests & tracking'],
              ['shield', 'Quality checks & approvals'],
              ['wallet', 'Payment milestones'],
              ['camera', 'Site photos & daily reports'],
            ].map(([icon, label]) => (
              <div key={label}>
                <Icon name={icon as IconName} size={21} />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        className="pp-container pp-section pp-operations"
        aria-label="Connected lead pipeline and project roles"
      >
        <article className="pp-operation-panel">
          <div className="pp-section-header">
            <div>
              <span className="pp-kicker">FROM FIRST ENQUIRY</span>
              <h2>From enquiry to confirmed project</h2>
              <p>
                One lead record, meaningful follow-ups, professional quotes and
                smooth conversion.
              </p>
            </div>
          </div>
          <div className="pp-pipeline">
            {[
              {
                title: 'New enquiry',
                name: 'Rohan Mehta',
                detail: 'Villa construction',
                amount: 'Enquiry received',
                cls: 'new',
              },
              {
                title: 'Site visit',
                name: 'Priya Sharma',
                detail: 'Office renovation',
                amount: 'Visit scheduled',
                cls: 'visit',
              },
              {
                title: 'Quotation',
                name: 'Design package',
                detail: '3 BHK interior',
                amount: 'Estimate shared',
                cls: 'quoted',
              },
              {
                title: 'Won project',
                name: 'Malhotra Residence',
                detail: 'Construction',
                amount: 'Project created',
                cls: 'won',
              },
            ].map((lead, i) => (
              <div
                className={'pp-pipeline-col pp-pipeline-' + lead.cls}
                key={lead.title}
              >
                <div className="pp-pipeline-title">
                  <span>{i + 1}</span>
                  <b>{lead.title}</b>
                </div>
                <div className="pp-pipeline-card">
                  <span className="pp-pipeline-photo">
                    <Icon name={i === 3 ? 'building' : 'home'} size={26} />
                  </span>
                  <strong>{lead.name}</strong>
                  <small>{lead.detail}</small>
                  <em>{lead.amount}</em>
                </div>
              </div>
            ))}
          </div>
        </article>
        <article className="pp-operation-panel pp-team-panel">
          <div className="pp-section-header">
            <div>
              <span className="pp-kicker">ONE TEAM, ONE SOURCE OF TRUTH</span>
              <h2>Your team &amp; clients, connected</h2>
              <p>
                Role-based access for business owners, field teams and
                customers.
              </p>
            </div>
          </div>
          <div className="pp-role-list">
            {roles.map((role) => (
              <div key={role.name}>
                <span className="pp-role-icon">
                  <Icon name="user" size={19} />
                </span>
                <span>
                  <b>{role.name}</b>
                  <small>{role.detail}</small>
                </span>
                <em>{role.label}</em>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section
        id="marketplace"
        className="pp-container pp-section pp-marketplace"
        aria-labelledby="pp-marketplace-title"
      >
        <div className="pp-section-header">
          <div>
            <span className="pp-kicker">
              CONSTRUCTION &amp; INTERIOR SOURCING
            </span>
            <h2 id="pp-marketplace-title">
              B2B marketplace for project materials
            </h2>
            <p>
              Explore material categories and connect with approved sellers
              through your workspace.
            </p>
          </div>
          <a href="/register" className="pp-text-link">
            Access marketplace <Icon name="arrow" size={16} />
          </a>
        </div>
        <div className="pp-material-grid">
          {materials.map((item) => (
            <article key={item.label} className="pp-material-tile">
              <div className={'pp-material-art pp-material-' + item.style}>
                <Icon name={item.icon} size={38} />
              </div>
              <strong>{item.label}</strong>
              <span>
                <Icon name="chevron" size={15} />
              </span>
            </article>
          ))}
        </div>
        <p className="pp-demo-note">
          Seller access and purchasing depend on approval, available listings
          and your workspace permissions.
        </p>
      </section>

      <section
        id="how-it-works"
        className="pp-container pp-section pp-setup"
        aria-labelledby="pp-setup-title"
      >
        <div className="pp-section-header">
          <div>
            <span className="pp-kicker">EASY TO GET STARTED</span>
            <h2 id="pp-setup-title">Get started in three simple steps</h2>
          </div>
        </div>
        <div className="pp-setup-grid">
          {[
            [
              '1',
              'user',
              'Create your workspace',
              'Register and set up your construction or interior business.',
            ],
            [
              '2',
              'users',
              'Invite your team',
              'Choose who can manage leads, sites, materials and approvals.',
            ],
            [
              '3',
              'chart',
              'Manage your projects',
              'Keep enquiries, execution and client updates in one place.',
            ],
          ].map(([number, icon, title, detail]) => (
            <article key={number}>
              <span className="pp-step-number">{number}</span>
              <span className="pp-step-icon">
                <Icon name={icon as IconName} size={25} />
              </span>
              <div>
                <h3>{title}</h3>
                <p>{detail}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section
        className="pp-container pp-final-cta"
        aria-labelledby="pp-cta-title"
      >
        <SiteIllustration className="pp-cta-illustration" />
        <div>
          <span className="pp-kicker">BUILT FOR A STRONGER TOMORROW</span>
          <h2 id="pp-cta-title">
            Run your entire construction business with clarity.
          </h2>
          <p>
            Less manual follow-up. Better site visibility. One connected team.
          </p>
        </div>
        <a href="/register" className="pp-btn pp-btn-white">
          Start Your Business <Icon name="arrow" size={18} />
        </a>
      </section>

      <footer className="pp-footer">
        <div className="pp-container pp-footer-grid">
          <div>
            <a href="/" aria-label="ProPulse home">
              <Brand />
            </a>
            <p>
              The connected operating system for construction and interior
              businesses.
            </p>
          </div>
          <div>
            <strong>Product</strong>
            <a href="#features">Features</a>
            <a href="#solutions">Project Management</a>
            <a href="#marketplace">Marketplace</a>
          </div>
          <div>
            <strong>Solutions</strong>
            <a href="#features">CRM &amp; Quotations</a>
            <a href="#solutions">Site Execution</a>
            <a href="#solutions">Finance &amp; Procurement</a>
          </div>
          <div>
            <strong>Company</strong>
            <a href="#how-it-works">How It Works</a>
            <a href="/login">Sign in</a>
            <a href="mailto:info@propulsetechnologies.online">Contact us</a>
          </div>
        </div>
        <div className="pp-container pp-footer-bottom">
          <span>© 2026 ProPulse Business OS</span>
          <span>Made for construction &amp; interior teams</span>
        </div>
      </footer>
    </main>
  );
}
