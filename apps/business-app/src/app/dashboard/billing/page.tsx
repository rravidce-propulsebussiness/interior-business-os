import Link from 'next/link';
import { activeOrganization, pageServices } from '@business-os/auth/server';
import { OwnerShell, type OwnerNavItem, OwnerIcon } from '../owner-shell';
import '../owner-dashboard.css';
import '../command-centre.css';
import '../finance/finance-home.css';

export const dynamic = 'force-dynamic';

export default async function SubscriptionBilling() {
  const { repository, user } = await pageServices();
  const ctx = await activeOrganization();
  if (!ctx)
    return <main className="fw-page">Select a company from Dashboard first.</main>;
  const org = await repository.organization(ctx.organizationId);
  if (!org) return <main className="fw-page">Company unavailable.</main>;

  const plans = await repository.plans().catch(() => []);
  const plan = plans.find((item) => item.id === org.plan_id);
  const key = plan?.key ?? '';
  const websiteEnabled = ctx.entitlements.includes('website');
  const operational = ['crm','quotation','projects','billing','reports','purchasing']
    .some((moduleKey) => ctx.entitlements.includes(moduleKey));
  const needsPurchase = key === 'website_unsubscribed';
  const websiteOnly = websiteEnabled && !operational;
  const isPropulse = key === 'propulse_managed';
  const displayedPlan = isPropulse
    ? operational ? 'ProPulse Scale' : websiteEnabled ? 'ProPulse Growth' : 'ProPulse membership inactive'
    : plan?.name ?? 'Not assigned';
  const navigation: OwnerNavItem[] = [
    { label: 'Dashboard', href: '/dashboard', icon: 'dashboard' },
    ...(websiteEnabled ? [{ label: 'Website', href: '/dashboard/website', icon: 'globe' as const }] : []),
    ...(ctx.entitlements.includes('billing')
      ? [{ label: 'Finance', href: '/dashboard/finance', icon: 'billing' as const }] : []),
    { label: 'Billing & Plans', href: '/dashboard/billing', icon: 'billing' },
    { label: 'Settings', href: '/dashboard/settings', icon: 'settings' },
  ];

  return (
    <OwnerShell
      companyName={org.name}
      accountLabel={(user.email ?? 'Account').split('@')[0] ?? 'Account'}
      accountEmail={user.email ?? ''}
      planLabel={displayedPlan}
      navigation={navigation}
      currentHref="/dashboard/billing"
      search=""
      dashboardBrand
      notificationsEnabled={ctx.grants.some((grant) => grant.permission === 'notification.view')}
    >
      <main className="fw-page" id="main-content">
        <div className="fw-crumb">
          <Link href="/dashboard">Dashboard</Link><span>/</span>
          <strong>Billing &amp; Plans</strong>
        </div>
        <header className="fw-heading">
          <div>
            <h1>Billing &amp; Plans</h1>
            <p>Manage your hosted website and Business OS subscription access.</p>
          </div>
        </header>
        <section className="fw-panel fw-feature">
          <OwnerIcon name="billing" size={31}/>
          <h2>Current plan: {displayedPlan}</h2>
          {needsPurchase ? (
            <>
              <p>Your business workspace is ready. Choose a paid Website Basic
                subscription to create and host a template-based website.</p>
              <p>Website Basic includes Business OS hosting, published templates,
                a customer enquiry inbox, and connection of a domain you own.</p>
              <p><strong>No domain is supplied or registered by Business OS.</strong>
                You retain responsibility for buying and renewing your domain.</p>
              <small>Plan prices and payment collection must be configured through
                an authorized checkout. This page does not accept payments or
                unlock a plan without a verified purchase.</small>
            </>
          ) : (
            <>
              <p>{websiteOnly
                ? 'Your plan includes a hosted, template-based business website and customer-owned custom-domain connection.'
                : 'Your Business OS subscription and module access are managed independently from company invoices.'}</p>
              {websiteEnabled && (
                <Link href="/dashboard/website" className="fw-primary">
                  Open Website Studio
                </Link>
              )}
              {operational && ctx.entitlements.includes('billing') && (
                <Link href="/dashboard/finance" className="fw-primary">
                  Open company Finance
                </Link>
              )}
              {isPropulse && (
                <p>ProPulse membership upgrades and renewals are managed in your
                  ProPulse account. Growth includes the hosted website; Scale
                  enables the complete Business OS.</p>
              )}
              {websiteEnabled && (
                <p>Connect a custom domain in Website Studio → Domains. The domain
                  belongs to you; Business OS provides connection, routing
                  verification, and HTTPS hosting.</p>
              )}
              <small>Subscription changes require verified payment or an authorized
                administrator. This page does not charge your bank account.</small>
            </>
          )}
        </section>
      </main>
    </OwnerShell>
  );
}
