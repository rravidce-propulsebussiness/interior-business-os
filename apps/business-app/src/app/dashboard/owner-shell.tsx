/* eslint-disable @next/next/no-html-link-for-pages -- Intentional full-document navigation avoids incomplete RSC Flight streams on Hostinger. */
'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { signOut } from '@business-os/auth/actions';
import { useCompanyNavigation } from './company-navigation-provider';
import './owner-dashboard.css';
import './command-centre.css';

const iconPaths = {
  dashboard: 'M3 10.5 12 3l9 7.5M5 9v12h14V9M9 21v-8h6v8',
  leads:
    'M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 20v-2a4 4 0 0 0-3-3.87M16 2.13a4 4 0 0 1 0 7.75',
  quotations: 'M6 2h9l5 5v15H6zM15 2v6h5M9 12h8M9 16h8',
  projects: 'M3 7h8l2 3h8v10H3zM3 7V4h8l2 3',
  clients:
    'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  marketplace: 'M4 9h16l-1-5H5L4 9Zm0 0v11h16V9M9 20v-7h6v7',
  purchases:
    'M3 3h2l3 12h11l3-9H6M10 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2M19 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2',
  billing: 'M6 2h12v20l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h4',
  expenses: 'M3 6h18v12H3zM3 10h18M7 15h4',
  reports: 'M4 19V11M10 19V5M16 19v-9M22 19V2M2 22h20',
  team: 'M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8M18 8h4M20 6v4',
  settings:
    'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM17 17l5 5',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'M5 5l14 14M19 5 5 19',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4',
  logout: 'M10 17l5-5-5-5M15 12H3M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7',
  crown: 'm2 8 5 4 5-8 5 8 5-4-2 12H4L2 8ZM4 20h16',
  plus: 'M12 5v14M5 12h14',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  globe:
    'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM2 12h20M12 2c-5 6-5 14 0 20M12 2c5 6 5 14 0 20',
  check: 'm4 12 5 5L20 6',
  calendar: 'M3 5h18v16H3zM7 2v6M17 2v6M3 10h18',
} as const;

export type OwnerIconName = keyof typeof iconPaths;

export function OwnerIcon({
  name,
  size = 20,
}: {
  name: OwnerIconName;
  size?: number;
}) {
  return (
    <svg
      aria-hidden="true"
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

export type OwnerNavItem = {
  label: string;
  href: string;
  icon: OwnerIconName;
  children?: { label: string; href: string }[];
};

export function OwnerShell({
  children,
  companyName,
  accountLabel,
  accountEmail,
  planLabel,
  navigation,
  search,
  notificationsEnabled,
  currentHref,
  dashboardBrand = false,
  searchAction = '/dashboard',
  searchPlaceholder = 'Search leads, projects, quotations...',
}: {
  children: ReactNode;
  companyName: string;
  accountLabel: string;
  accountEmail: string;
  planLabel: string;
  navigation: OwnerNavItem[];
  search: string;
  notificationsEnabled: boolean;
  currentHref?: string;
  dashboardBrand?: boolean;
  searchAction?: string;
  searchPlaceholder?: string;
}) {
  const sharedNavigation = useCompanyNavigation();
  // When the shared dashboard layout is present, ignore short page-specific
  // menus: permissions and menu order must remain stable across every route.
  const displayedNavigation = sharedNavigation ?? navigation;
  const [menuOpen, setMenuOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!menuOpen) return;
    if (window.innerWidth > 1199) {
      setMenuOpen(false);
      return;
    }

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
    accountLabel
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || 'BO';

  return (
    <div className="owner-layout owner-layout-unified">
      {menuOpen && (
        <button
          className="owner-scrim"
          aria-label="Close navigation"
          onClick={() => {
            setMenuOpen(false);
            toggleRef.current?.focus();
          }}
          type="button"
        />
      )}
      <aside
        ref={sidebarRef}
        id="owner-sidebar-navigation"
        className={'owner-sidebar' + (menuOpen ? ' owner-sidebar-open' : '')}
        aria-label="Company navigation"
      >
        <a
          href="/dashboard"
          className="owner-brand"
          onClick={() => setMenuOpen(false)}
        >
          <span className="owner-brand-icon">
            <OwnerIcon name="dashboard" size={27} />
          </span>
          <span>
            <strong>ProPulse</strong>
            <small>Business OS</small>
          </span>
        </a>
        <div className="owner-mobile-heading">
          <span>Workspace menu</span>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close navigation"
            onClick={() => {
              setMenuOpen(false);
              toggleRef.current?.focus();
            }}
          >
            <OwnerIcon name="close" size={20} />
          </button>
        </div>
        <nav className="owner-nav" aria-label="Your company's modules">
          {displayedNavigation.map((item) => {
            const selected = currentHref
              ? item.href === currentHref
              : item.href === '/dashboard';
            const childActive =
              item.children?.some((child) => child.href === currentHref) ??
              false;
            if (item.children?.length) {
              const isExpanded =
                expanded[item.href] ?? (selected || childActive);
              return (
                <div className="owner-nav-group" key={item.href}>
                  <button
                    type="button"
                    className={
                      'owner-nav-item owner-nav-group-toggle' +
                      (selected || childActive ? ' owner-nav-active' : '')
                    }
                    aria-expanded={isExpanded}
                    aria-controls={
                      'owner-subnav-' + item.href.replace(/[^a-z0-9]/gi, '-')
                    }
                    onClick={() =>
                      setExpanded((previous) => ({
                        ...previous,
                        [item.href]: !isExpanded,
                      }))
                    }
                  >
                    <OwnerIcon name={item.icon} size={20} />
                    <span>{item.label}</span>
                    <span
                      className={
                        'owner-nav-chevron' +
                        (isExpanded ? ' owner-nav-chevron-open' : '')
                      }
                      aria-hidden="true"
                    >
                      ⌄
                    </span>
                  </button>
                  {isExpanded && (
                    <div
                      className="owner-subnav"
                      id={
                        'owner-subnav-' + item.href.replace(/[^a-z0-9]/gi, '-')
                      }
                    >
                      {item.children.map((child) => (
                        <a
                          key={child.href}
                          href={child.href}
                          className={
                            'owner-subnav-link' +
                            (child.href === currentHref
                              ? ' owner-subnav-active'
                              : '')
                          }
                          aria-current={
                            child.href === currentHref ? 'page' : undefined
                          }
                          onClick={() => setMenuOpen(false)}
                        >
                          <span
                            className="owner-subnav-dot"
                            aria-hidden="true"
                          />
                          {child.label}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              );
            }
            return (
              <a
                key={item.href}
                href={item.href}
                className={
                  'owner-nav-item' + (selected ? ' owner-nav-active' : '')
                }
                aria-current={selected ? 'page' : undefined}
                onClick={() => setMenuOpen(false)}
              >
                <OwnerIcon name={item.icon} size={20} />
                <span>{item.label}</span>
              </a>
            );
          })}
        </nav>
        <div className="owner-sidebar-bottom">
          <div className="owner-plan-card">
            <OwnerIcon name="crown" size={21} />
            <div>
              <strong>{planLabel}</strong>
              <small>Company subscription</small>
            </div>
          </div>
          <p className="owner-sidebar-company" title={companyName}>
            {companyName}
          </p>
        </div>
      </aside>
      <div className="owner-workspace">
        <header className="owner-topbar">
          <button
            ref={toggleRef}
            className="owner-menu-button"
            type="button"
            aria-label="Open navigation"
            aria-controls="owner-sidebar-navigation"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <OwnerIcon name="menu" size={22} />
          </button>
          {dashboardBrand && <a className="owner-command-mobile-brand" href="/dashboard">
            <span className="owner-command-mobile-mark">{companyName.trim().charAt(0).toUpperCase()}</span>
            <strong>{companyName}</strong>
          </a>}
          <form
            className="owner-search"
            action={searchAction}
            method="GET"
            role="search"
          >
            <OwnerIcon name="search" size={19} />
            <input
              type="search"
              name="q"
              defaultValue={search}
              maxLength={80}
              placeholder={searchPlaceholder}
              aria-label="Search within this company"
            />
          </form>
          <div className="owner-account-actions">
            {notificationsEnabled && (
              <a
                href="/dashboard/notifications"
                className="owner-topbar-icon"
                aria-label="Notifications"
              >
                <OwnerIcon name="bell" size={21} />
              </a>
            )}
            <details className="owner-profile">
              <summary aria-label="Account menu">
                <span className="owner-profile-avatar">{initials}</span>
                <span className="owner-profile-label">
                  <strong>{accountLabel}</strong>
                  <small>Company workspace</small>
                </span>
                <span className="owner-profile-chevron">⌄</span>
              </summary>
              <div className="owner-profile-menu">
                <strong>{companyName}</strong>
                <small>{accountEmail}</small>
                <form action={signOut}>
                  <button type="submit">
                    <OwnerIcon name="logout" size={17} /> Sign out
                  </button>
                </form>
              </div>
            </details>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
