import Link from 'next/link';
import { activeOrganization, pageServices } from '@business-os/auth/server';
import { OwnerShell, type OwnerNavItem, OwnerIcon } from '../owner-shell';
import '../owner-dashboard.css';
import '../command-centre.css';
import '../finance/finance-home.css';

export const dynamic = 'force-dynamic';
export default async function SubscriptionBilling() {
  const { repository, user, client } = await pageServices();
  const ctx = await activeOrganization();
  if (!ctx) return <main className="fw-page">Select a company from Dashboard first.</main>;
  const org = await repository.organization(ctx.organizationId);
  if (!org) return <main className="fw-page">Company unavailable.</main>;
  const plans = await repository.plans().catch(() => []);
  const plan = plans.find((item) => item.id === org.plan_id);
  const linked = await client.rpc('propulse_company_profile', {
    p_organization_id: ctx.organizationId,
  });
  const profile = linked && !linked.error
    ? linked.data as { tier?: string; accessExpiresAt?: string | null } | null
    : null;
  const activeTier = profile?.accessExpiresAt &&
    Date.parse(profile.accessExpiresAt) > Date.now()
    ? profile.tier : 'none';
  const navigation: OwnerNavItem[] = [
    ...(ctx.entitlements.includes('website') ? [{ label: 'Website', href: '/dashboard/website', icon: 'globe' as const }] : []),
    { label: 'Billing & Plans', href: '/dashboard/billing', icon: 'billing' },
    { label: 'Settings', href: '/dashboard/settings', icon: 'settings' },
  ];
  return <OwnerShell companyName={org.name}
    accountLabel={(user.email ?? 'Account').split('@')[0] ?? 'Account'}
    accountEmail={user.email ?? ''} planLabel={plan?.name ?? 'Business plan'}
    navigation={navigation} currentHref="/dashboard/billing" search="" dashboardBrand
    notificationsEnabled={ctx.grants.some((g) => g.permission === 'notification.view')}>
    <main className="fw-page" id="main-content">
      <div className="fw-crumb"><Link href="/dashboard">Dashboard</Link><span>/</span><strong>Billing & Plans</strong></div>
      <header className="fw-heading"><div><h1>Billing & Plans</h1><p>Your Business OS subscription, access and plan information.</p></div></header>
      <section className="fw-panel fw-feature">
        <OwnerIcon name="billing" size={31}/>
        <h2>Current plan: {plan?.name ?? 'Not assigned'}</h2>
        {profile && <p>ProPulse package: {activeTier === 'scale' ? 'Scale — complete Business OS' : activeTier === 'growth' ? 'Growth — hosted template website' : 'No active membership synced'}.</p>}
        {profile && <p>Package changed or renewed? <Link href="/auth/propulse" className="underline">Reconnect ProPulse to refresh access</Link>.</p>}
        <p>Business OS platform subscriptions are separate from your company&apos;s customer invoices, supplier expenses and GST.</p>
        {ctx.entitlements.includes('website') ? <Link href="/dashboard/website" className="fw-primary">Open Website →</Link> : <p>Website access is pending plan activation. The platform administrator can activate Website Basic after payment verification.</p>}
        <small>Plan changes and subscription payments must use an authorized subscription checkout or administrator. No payment is taken on this page.</small>
      </section>
    </main>
  </OwnerShell>;
}