import Link from 'next/link';
import type { ReactNode } from 'react';
import { OwnerIcon, type OwnerIconName } from '../owner-shell';
import './studio.css';

const links: { title: string; href: string; icon: OwnerIconName }[] = [
  { title: 'Dashboard', href: '/dashboard', icon: 'dashboard' },
  { title: 'CRM & Leads', href: '/dashboard/crm/leads', icon: 'leads' },
  { title: 'Quotations', href: '/dashboard/quotations', icon: 'quotations' },
  { title: 'Projects', href: '/dashboard/projects', icon: 'projects' },
  { title: 'Clients', href: '/dashboard/customers', icon: 'clients' },
  { title: 'Billing', href: '/dashboard/billing', icon: 'billing' },
  { title: 'Team', href: '/dashboard/company/team', icon: 'team' },
  { title: 'Reports', href: '/dashboard/reports', icon: 'reports' },
  {
    title: 'Company Profile',
    href: '/dashboard/company/settings',
    icon: 'globe',
  },
  {
    title: 'Settings',
    href: '/dashboard/quotations/settings',
    icon: 'settings',
  },
];

export function QuotationStudioFrame({
  companyName,
  accountEmail,
  children,
}: {
  companyName: string;
  accountEmail?: string;
  children: ReactNode;
}) {
  const initials =
    companyName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() || '')
      .join('') || 'OS';

  return (
    <div className="qs-layout">
      <aside className="qs-sidebar">
        <Link href="/dashboard" className="qs-brand">
          <span className="qs-brand-mark">{initials}</span>
          <span>
            <strong>{companyName}</strong>
            <small>Business OS · Workspace</small>
          </span>
        </Link>
        <nav aria-label="Workspace navigation" className="qs-nav">
          {links.map((entry) => (
            <Link
              href={entry.href}
              key={entry.href}
              className={
                'qs-nav-item' +
                (entry.title === 'Quotations' ? ' qs-active' : '')
              }
              aria-current={entry.title === 'Quotations' ? 'page' : undefined}
            >
              <OwnerIcon name={entry.icon} size={19} />
              <span>{entry.title}</span>
            </Link>
          ))}
        </nav>
        <div className="qs-sidebar-foot">
          <span className="qs-plan-spark">✦</span>
          <div>
            <strong>Quotation Studio</strong>
            <small>Branded proposals for your company</small>
          </div>
        </div>
      </aside>
      <div className="qs-workspace">
        <header className="qs-topbar">
          <Link href="/dashboard/quotations" className="qs-mobile-brand">
            <span className="qs-brand-mark">{initials}</span>
            <strong>{companyName}</strong>
          </Link>
          <form
            action="/dashboard/quotations"
            method="get"
            className="qs-search"
          >
            <OwnerIcon name="search" size={18} />
            <input
              name="q"
              type="search"
              placeholder="Search projects, clients, quotations…"
              aria-label="Search quotations"
            />
          </form>
          <div className="qs-top-user">
            <span className="qs-avatar">
              {accountEmail?.[0]?.toUpperCase() || initials[0]}
            </span>
            <span>
              <strong>{accountEmail?.split('@')[0] || 'Company owner'}</strong>
              <small>Your workspace</small>
            </span>
          </div>
        </header>
        <main className="qs-main" id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
