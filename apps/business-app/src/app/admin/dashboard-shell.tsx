'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';

type IconName =
  | 'dashboard'
  | 'marketplace'
  | 'users'
  | 'crown'
  | 'billing'
  | 'quotation'
  | 'crm'
  | 'projects'
  | 'website'
  | 'domain'
  | 'settings'
  | 'reports'
  | 'integrations'
  | 'bell'
  | 'menu'
  | 'search'
  | 'chevron'
  | 'arrow'
  | 'check'
  | 'close';

const paths: Record<IconName, string> = {
  dashboard: 'M3 10.5 12 3l9 7.5M5 9v12h14V9M9 21v-8h6v8',
  marketplace:
    'M4 9h16l-1-5H5L4 9Zm0 0v11h16V9M9 20v-7h6v7M3 9c0 3 3 4 5 2 2 2 6 2 8 0 2 2 5 1 5-2',
  users:
    'M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 20v-2a4 4 0 0 0-3-3.87M16 2.13a4 4 0 0 1 0 7.75',
  crown: 'm2 8 5 4 5-8 5 8 5-4-2 12H4L2 8ZM4 20h16',
  billing: 'M3 6h18v12H3zM3 10h18M7 15h4',
  quotation: 'M6 2h9l5 5v15H6zM15 2v6h5M9 12h8M9 16h8',
  crm: 'M12 21s-9-5.5-9-12a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6.5-9 12-9 12Z',
  projects: 'M3 7h8l2 3h8v10H3zM3 7V4h8l2 3',
  website: 'M3 4h18v14H3zM8 22h8M12 18v4M3 8h18',
  domain:
    'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM2 12h20M12 2c-5 6-5 14 0 20M12 2c5 6 5 14 0 20',
  settings:
    'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM9.8 2h4.4l.7 2.3 2 .9 2.2-1.1 3.1 3.1-1.1 2.2.9 2 2.3.7v4.4l-2.3.7-.9 2 1.1 2.2-3.1 3.1-2.2-1.1-2 .9-.7 2.3H9.8l-.7-2.3-2-.9-2.2 1.1-3.1-3.1 1.1-2.2-.9-2-2.3-.7v-4.4l2.3-.7.9-2-1.1-2.2 3.1-3.1 2.2 1.1 2-.9L9.8 2',
  reports: 'M4 19V11M10 19V5M16 19v-9M22 19V2M2 22h20',
  integrations: 'M8 4v6M16 4v6M5 10h14v3a7 7 0 0 1-14 0v-3ZM12 20v2',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4',
  menu: 'M4 6h16M4 12h16M4 18h16',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM17 17l5 5',
  chevron: 'm7 10 5 5 5-5',
  arrow: 'M4 12h16m-7-7 7 7-7 7',
  check: 'm4 12 5 5L20 6',
  close: 'M5 5l14 14M19 5 5 19',
};

export function OsIcon({
  name,
  size = 19,
  className = '',
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
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
      <path d={paths[name]} />
    </svg>
  );
}

const primary: { title: string; icon: IconName; href: string }[] = [
  { title: 'Dashboard', icon: 'dashboard', href: '/admin' },
  {
    title: 'Marketplace',
    icon: 'marketplace',
    href: '/admin/control/marketplace',
  },
  {
    title: 'Organizations & Owners',
    icon: 'users',
    href: '/admin/organizations',
  },
  { title: 'Membership Plans', icon: 'crown', href: '/admin/plans' },
  {
    title: 'Billing & Payments',
    icon: 'billing',
    href: '/admin/control/billing',
  },
  {
    title: 'Quotations',
    icon: 'quotation',
    href: '/admin/control/quotations',
  },
  { title: 'CRM & Leads', icon: 'crm', href: '/admin/control/crm' },
  {
    title: 'Project Management',
    icon: 'projects',
    href: '/admin/control/projects',
  },
  { title: 'Website Builder', icon: 'website', href: '/admin/website' },
  { title: 'Domain Management', icon: 'domain', href: '/admin/domains' },
  {
    title: 'Settings & Customization',
    icon: 'settings',
    href: '/admin/control/settings',
  },
];
const secondary: { title: string; icon: IconName; href: string }[] = [
  {
    title: 'Reports & Analytics',
    icon: 'reports',
    href: '/admin/control/reports',
  },
  {
    title: 'Integrations',
    icon: 'integrations',
    href: '/admin/control/integrations',
  },
  {
    title: 'Notifications',
    icon: 'bell',
    href: '/admin/control/notifications',
  },
];

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menu = (items: typeof primary) =>
    items.map((item) => {
      const selected =
        item.href === '/admin'
          ? pathname === item.href
          : pathname.startsWith(item.href);
      return (
        <Link
          key={item.href}
          href={item.href}
          onClick={() => setOpen(false)}
          aria-current={selected ? 'page' : undefined}
          className={`os-nav-link ${selected ? 'os-selected' : ''}`}
        >
          <OsIcon name={item.icon} />
          <span>{item.title}</span>
        </Link>
      );
    });
  return (
    <div className="os-shell">
      {open && (
        <button
          type="button"
          className="os-overlay"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        className={`os-sidebar ${open ? 'os-sidebar-open' : ''}`}
        aria-label="Super Admin navigation"
      >
        <Link className="os-brand" href="/admin" onClick={() => setOpen(false)}>
          <span className="os-brand-mark">
            <OsIcon name="dashboard" size={23} />
          </span>
          <span>
            <strong>ProPulse</strong>
            <small>Business OS</small>
          </span>
        </Link>
        <nav className="os-navigation" aria-label="Platform">
          {menu(primary)}
          <div className="os-nav-divider" />
          {menu(secondary)}
        </nav>
        <div className="os-sidebar-foot">
          <span className="os-online-dot" /> Platform controls
          <small>Tenant-scoped access is enforced</small>
          {/* The platform dashboard lives here. Do not expose a competing
              dashboard navigation link from this workspace. */}
          <Link href="/admin/automations">
            Automation health <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </aside>
      <div className="os-workspace">
        <header className="os-topbar">
          <button
            className="os-mobile-toggle"
            type="button"
            aria-label="Open navigation"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            <OsIcon name="menu" />
          </button>
          <Link className="os-tenant-switcher" href="/admin/organizations">
            <OsIcon name="users" size={16} /> All tenants{' '}
            <OsIcon name="chevron" size={15} />
          </Link>
          <form
            className="os-global-search"
            action="/admin/organizations"
            method="GET"
            role="search"
          >
            <OsIcon name="search" size={18} />
            <input
              name="q"
              type="search"
              maxLength={80}
              aria-label="Search tenant organizations"
              placeholder="Search tenant organizations..."
            />
          </form>
          <Link
            className="os-notification-button"
            href="/admin/control/notifications"
            aria-label="Notifications"
          >
            <OsIcon name="bell" size={20} />
          </Link>
          <div className="os-admin-profile">
            <span className="os-avatar">SA</span>
            <span>
              <strong>Super Admin</strong>
              <small>Platform workspace</small>
            </span>
          </div>
        </header>
        <div className="os-page-content">{children}</div>
      </div>
    </div>
  );
}
