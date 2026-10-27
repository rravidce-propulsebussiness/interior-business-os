/* Shared compact navigation for the owner dashboard and project pages.
 * Reuses the same links and permission-filtered ordering; no duplicate bar. */
import { OwnerIcon, type OwnerIconName } from './owner-shell';

export type MobileNavItem = {
  label: string;
  href: string;
  icon: OwnerIconName;
};

export function OwnerMobileNav({
  navigation,
  currentHref,
}: {
  navigation: MobileNavItem[];
  currentHref: string;
}) {
  return (
    <nav className="command-mobile-nav" aria-label="Workspace shortcuts">
      {navigation.slice(0, 5).map((item) => (
        <a
          href={item.href}
          key={item.href}
          aria-current={item.href === currentHref ? 'page' : undefined}
        >
          <OwnerIcon name={item.icon} size={20} />
          <span>{item.label}</span>
        </a>
      ))}
    </nav>
  );
}
