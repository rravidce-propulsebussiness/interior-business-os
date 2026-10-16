// Company branding supports company-owned PNG/JPEG data URIs only.
/* eslint-disable @next/next/no-img-element -- Inline validated tenant logo */
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { OwnerIcon, type OwnerIconName } from '../owner-shell';
import './studio.css';

const links: { title: string; href: string; icon: OwnerIconName }[] = [
  { title: 'Dashboard', href: '/dashboard', icon: 'dashboard' },
  { title: 'Leads', href: '/dashboard/crm/leads', icon: 'leads' },
  { title: 'Clients', href: '/dashboard/customers', icon: 'clients' },
  { title: 'Projects', href: '/dashboard/projects', icon: 'projects' },
  { title: 'Billing', href: '/dashboard/billing', icon: 'billing' },
  { title: 'Team', href: '/dashboard/company/team', icon: 'team' },
  { title: 'Reports', href: '/dashboard/reports', icon: 'reports' },
  { title: 'Company Settings', href: '/dashboard/company/settings', icon: 'settings' },
];

const quotationLinks = [
  { title: 'Create Quote', href: '/dashboard/quotations/new' },
  { title: 'My Quotes', href: '/dashboard/quotations' },
  { title: 'Packages', href: '/dashboard/quotations/packages' },
  { title: 'Branding & Settings', href: '/dashboard/quotations/settings' },
] as const;

export function QuotationStudioFrame({
  companyName,
  companyLogo,
  accountEmail,
  children,
}: {
  companyName: string;
  companyLogo?: string;
  accountEmail?: string;
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const [quotesExpanded, setQuotesExpanded] = useState(() => pathname.startsWith('/dashboard/quotations'));
  const quotationPath = pathname.startsWith('/dashboard/quotations');
  const toggleRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        toggleRef.current?.focus();
        return;
      }
      if (event.key !== 'Tab' || !sidebarRef.current) return;
      const focusable = Array.from(
        sidebarRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled])',
        ),
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const onResize = () => {
      if (window.innerWidth > 1199) setMenuOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
    };
  }, [menuOpen]);

  const initials =
    companyName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() || '')
      .join('') || 'OS';

  return (
    <div className="qs-layout">
      {menuOpen && (
        <button
          type="button"
          className="qs-nav-scrim"
          aria-label="Close workspace navigation"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <aside
        ref={sidebarRef}
        id="qs-sidebar-navigation"
        className={'qs-sidebar' + (menuOpen ? ' qs-sidebar-open' : '')}
        aria-label="Company navigation"
      >
        <Link
          href="/dashboard"
          className="qs-brand"
          onClick={() => setMenuOpen(false)}
        >
          {companyLogo ? <img className="qs-company-logo" src={companyLogo} alt={companyName + ' logo'}/> :
            <span className="qs-brand-mark">{initials}</span>}
          <span>
            <strong>{companyName}</strong>
            <small>Company workspace</small>
          </span>
        </Link>
        <div className="qs-mobile-heading">
          <strong>Workspace menu</strong>
          <button
            ref={closeRef}
            type="button"
            className="qs-mobile-close-button"
            aria-label="Close workspace menu"
            onClick={() => {
              setMenuOpen(false);
              toggleRef.current?.focus();
            }}
          >
            <OwnerIcon name="close" size={21} />
          </button>
        </div>
        <nav aria-label="Workspace navigation" className="qs-nav qs-nav-clean">
          {links.slice(0, 4).map((entry) => {
            const selected = pathname === entry.href ||
              (entry.href !== '/dashboard' && pathname.startsWith(entry.href + '/'));
            return <Link key={entry.href} href={entry.href}
              className={'qs-nav-item' + (selected ? ' qs-active' : '')}
              aria-current={selected ? 'page' : undefined}
              onClick={() => setMenuOpen(false)}>
              <OwnerIcon name={entry.icon} size={19} />
              <span>{entry.title}</span>
            </Link>;
          })}
          <div className="qs-quote-nav-group">
            <button type="button" className={'qs-nav-item qs-quote-group-trigger' +
              (quotationPath ? ' qs-active' : '')}
              aria-expanded={quotesExpanded} aria-controls="qs-quote-subnav"
              onClick={() => setQuotesExpanded((expanded) => !expanded)}>
              <OwnerIcon name="quotations" size={19}/>
              <span>Quotations</span>
              <span className="qs-quote-nav-chevron" aria-hidden="true">
                {quotesExpanded ? '⌃' : '⌄'}
              </span>
            </button>
            {quotesExpanded && <div className="qs-quote-subnav" id="qs-quote-subnav">
              {quotationLinks.map((entry) => {
                const selected = entry.href === '/dashboard/quotations'
                  ? pathname === entry.href
                  : pathname === entry.href || pathname.startsWith(entry.href + '/');
                return <Link href={entry.href} key={entry.href}
                  className={'qs-quote-subnav-link' + (selected ? ' current' : '')}
                  aria-current={selected ? 'page' : undefined}
                  onClick={() => setMenuOpen(false)}>{entry.title}</Link>;
              })}
            </div>}
          </div>
          {links.slice(4).map((entry) => {
            const selected = pathname === entry.href || pathname.startsWith(entry.href + '/');
            return <Link key={entry.href} href={entry.href}
              className={'qs-nav-item' + (selected ? ' qs-active' : '')}
              aria-current={selected ? 'page' : undefined}
              onClick={() => setMenuOpen(false)}>
              <OwnerIcon name={entry.icon} size={19}/>
              <span>{entry.title}</span>
            </Link>;
          })}
        </nav>
      </aside>
      <div className="qs-workspace">
        <header className="qs-topbar">
          <button
            ref={toggleRef}
            type="button"
            className="qs-mobile-menu-button"
            aria-label="Open workspace menu"
            aria-controls="qs-sidebar-navigation"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <OwnerIcon name="menu" size={22} />
          </button>
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
