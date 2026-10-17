import Link from 'next/link';
import { activeOrganization, pageServices } from '@business-os/auth/server';
import { createGstRepository, type GstDocumentRow } from '@business-os/database/gst';
import { createMarketplaceRepository, type MarketplaceOrder } from '@business-os/database/marketplace';
import { createLabourDisbursementsRepository, type LabourDisbursement } from '@business-os/database/labour-disbursements';
import { OwnerShell, type OwnerNavItem, OwnerIcon } from '../owner-shell';
import { OwnerMobileNav } from '../owner-mobile-nav';
import { createGstTemplatesRepository, type GstFilingDocument } from '@business-os/database/gst-templates';
import { SalaryPanel } from './salary-panel';
import '../owner-dashboard.css';
import '../command-centre.css';
import './finance-home.css';

export const dynamic = 'force-dynamic';
type Tab = 'invoices' | 'expenses' | 'gst' | 'salaries';
type Period = 'month' | 'quarter' | 'year' | 'all';
const tabs: { id: Tab; label: string; icon: 'billing' | 'expenses' | 'reports' | 'team' }[] = [
  { id: 'invoices', label: 'Invoices', icon: 'billing' },
  { id: 'expenses', label: 'Expenses', icon: 'expenses' },
  { id: 'gst', label: 'GST', icon: 'reports' },
  { id: 'salaries', label: 'Salaries', icon: 'team' },
];
const money = (value: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
    .format(Number.isFinite(value) ? value : 0);
function fromDate(period: Period): string | null {
  if (period === 'all') return null;
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (period === 'month' ? 0 : period === 'quarter' ? 2 : 11), 1));
  return start.toISOString().slice(0, 10);
}
const fmtDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata',
  }).format(date);
};
function tabUrl(tab: Tab, period: Period, q = '') {
  const params = new URLSearchParams({ tab });
  if (period !== 'all') params.set('period', period);
  if (q) params.set('q', q);
  return '/dashboard/finance?' + params.toString();
}
function Metric({ title, value, detail, icon }: { title: string; value: string; detail: string; icon: 'billing' | 'expenses' | 'reports' | 'team' }) {
  return <article className="fw-metric"><span className="fw-metric-icon"><OwnerIcon name={icon} size={23}/></span>
    <div><span>{title}</span><strong>{value}</strong><small>{detail}</small></div></article>;
}
function Empty({ title, detail }: { title: string; detail: string }) {
  return <div className="fw-empty"><OwnerIcon name="billing" size={24}/><strong>{title}</strong><p>{detail}</p></div>;
}
function indianToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone:'Asia/Kolkata', year:'numeric',month:'2-digit',day:'2-digit',
  }).formatToParts(new Date());
  const value = (key: string) => parts.find(p => p.type === key)?.value ?? '01';
  return { today: value('year')+'-'+value('month')+'-'+value('day'),
    first: value('year')+'-'+value('month')+'-01' };
}
function GstInline({from,to,rows,invalid}:{
  from:string;to:string;
  rows:{sales:GstFilingDocument[];purchases:GstFilingDocument[]}|null;
  invalid:boolean;
}) {
  const total = (list:GstFilingDocument[], key:'taxable'|'cgst'|'sgst'|'igst'|'total') =>
    list.reduce((sum,item)=>sum+Number(item[key]),0);
  const link = (kind:'sales_invoice'|'purchase_bill', format:'summary'|'items') =>
    '/dashboard/billing/gst-reports/export?'+
    new URLSearchParams({from,to,kind,format}).toString();
  const sales=rows?.sales??[];
  const purchases=rows?.purchases??[];
  return <section className="fw-panel fw-gst-panel" aria-label="GST reports">
    <div className="fw-panel-head"><div><h2>GST reports & reconciliation</h2>
      <p>GST records and export workpapers are here—no second GST page to open.</p></div></div>
    <form className="fw-gst-period" action="/dashboard/finance" method="get">
      <input type="hidden" name="tab" value="gst"/>
      <label>From<input type="date" name="from" defaultValue={from} required/></label>
      <label>To<input type="date" name="to" defaultValue={to} required/></label>
      <button type="submit">Apply dates</button>
    </form>
    {invalid ? <p role="alert" className="fw-muted">Choose valid dates in order, up to 366 days apart.</p> :
      rows === null ? <p role="alert" className="fw-muted">GST reports could not be loaded. Please try again later.</p> :
      <>
        <div className="fw-gst-stats">
          <div><span>Issued sales invoices</span><strong>{sales.length}</strong></div>
          <div><span>Output GST</span><strong>{money(total(sales,'cgst')+total(sales,'sgst')+total(sales,'igst'))}</strong></div>
          <div><span>Recorded purchases</span><strong>{purchases.length}</strong></div>
        </div>
        <div className="fw-gst-registers">
          <article><h3>Sales GST register</h3>
            <p>Taxable sales: <strong>{money(total(sales,'taxable'))}</strong></p>
            <a className="fw-primary" href={link('sales_invoice','summary')}>Download sales CSV</a>
            <a className="fw-gst-secondary" href={link('sales_invoice','items')}>HSN/SAC details</a>
          </article>
          <article><h3>Purchase reconciliation</h3>
            <p>Recorded purchases: <strong>{money(total(purchases,'total'))}</strong></p>
            <a className="fw-primary" href={link('purchase_bill','summary')}>Download purchase CSV</a>
            <a className="fw-gst-secondary" href={link('purchase_bill','items')}>Purchase items</a>
          </article>
        </div>
      </>}
    <p className="fw-footnote">These are accountant workpapers, not GSTN filing or GSTR-2B verification. Confirm eligibility before claiming input tax credit.</p>
  </section>;
}
export default async function Finance({
  searchParams,
}: { searchParams: Promise<{ tab?: string; period?: string; q?: string; month?: string; from?: string; to?: string }> }) {
  const { authorization, repository, client, user } = await pageServices();
  const ctx = await activeOrganization();
  if (!ctx) return <main className="fw-empty"><h1>Select a company to open Finance.</h1><Link href="/dashboard">Dashboard</Link></main>;
  await authorization.requirePermission(ctx.organizationId, 'invoice.view');
  const org = await repository.organization(ctx.organizationId);
  if (!org) return <main className="fw-empty">Company unavailable.</main>;
  const params = await searchParams;
  const tab: Tab = tabs.some((t) => t.id === params.tab) ? params.tab as Tab : 'invoices';
  const period: Period = ['month', 'quarter', 'year', 'all'].includes(params.period ?? '') ? params.period as Period : 'all';
  const q = (params.q ?? '').trim().slice(0, 80).toLowerCase();
  const grants = new Set(ctx.grants.filter((g) => g.scope.kind === 'organization').map((g) => g.permission));
  const canCreate = grants.has('invoice.create');
  const canPayments = grants.has('payment.view');
  const canMarketplace = grants.has('purchase.view');
  const orgId = ctx.organizationId;
  const gst = createGstRepository(client);
  const [all, marketplace, labour] = await Promise.all([
    gst.list(orgId, 'all'),
    tab === 'expenses' && canMarketplace
      ? createMarketplaceRepository(client).orders(orgId, 'buyer')
      : Promise.resolve([] as MarketplaceOrder[]),
    tab === 'expenses' && canPayments
      ? createLabourDisbursementsRepository(client).list(orgId,
        new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString().slice(0, 10),
        new Date().toISOString().slice(0, 10))
      : Promise.resolve([] as LabourDisbursement[]),
  ]);
  const cutoff = fromDate(period);
  const inPeriod = all.filter((doc) => !cutoff || doc.date >= cutoff);
  const sales = inPeriod.filter((doc) => doc.kind === 'sales_invoice');
  const issued = sales.filter((doc) => doc.status === 'issued');
  const bills = inPeriod.filter((doc) => doc.kind === 'purchase_bill');
  const recorded = bills.filter((doc) => doc.status === 'recorded');
  const filterRows = (rows: GstDocumentRow[]) =>
    rows.filter((doc) => !q || [doc.number ?? '', doc.partyName, doc.status].join(' ').toLowerCase().includes(q))
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const invoiceRows = filterRows(sales);
  const expenseRows = filterRows(bills);
  const acceptedOrders = marketplace.filter((order) =>
    order.status === 'accepted' && (!q || [order.productName, order.sellerName].join(' ').toLowerCase().includes(q)));
  const paidLabour = labour.filter((row) => row.status === 'paid');
  const india = indianToday();
  const gstFrom = params.from ?? india.first;
  const gstTo = params.to ?? india.today;
  const validIso = (value:string) => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0,10) === value;
  const gstInvalid = !validIso(gstFrom) || !validIso(gstTo) ||
    gstFrom > gstTo || Date.parse(gstTo)-Date.parse(gstFrom)>366*86400000;
  const gstReports = tab === 'gst' && !gstInvalid
    ? await Promise.all([
      createGstTemplatesRepository(client).filingRows(orgId,gstFrom,gstTo,'sales_invoice'),
      createGstTemplatesRepository(client).filingRows(orgId,gstFrom,gstTo,'purchase_bill'),
    ]).then(([sales,purchases])=>({sales,purchases})).catch(()=>null)
    : null;
  const nav: OwnerNavItem[] = [
    { label: 'Dashboard', href: '/dashboard', icon: 'dashboard' },
    { label: 'Finance', href: '/dashboard/finance', icon: 'billing' },
    { label: 'Projects', href: '/dashboard/projects', icon: 'projects' },
    ...(grants.has('team.manage') ? [{ label:'Employees', href:'/dashboard/employees',icon:'team' as const }] : []),
    { label: 'Settings', href: '/dashboard/settings', icon: 'settings' },
    { label: 'Billing & Plans', href: '/dashboard/billing', icon: 'billing' },
  ];
  const bottomNav = [
    { label: 'Dashboard', href: '/dashboard', icon: 'dashboard' as const },
    { label: 'Projects', href: '/dashboard/projects', icon: 'projects' as const },
    { label: 'Finance', href: '/dashboard/finance', icon: 'billing' as const },
    ...(grants.has('team.manage') ? [{ label:'Employees', href:'/dashboard/employees', icon:'team' as const }] : []),
    { label: 'Team', href: '/dashboard/company/team', icon: 'team' as const },
    { label: 'Settings', href: '/dashboard/settings', icon: 'settings' as const },
  ];
  const headlineAction = tab === 'invoices'
    ? { label: 'Create invoice', href: '/dashboard/billing/new?kind=sales_invoice' }
    : tab === 'expenses'
      ? { label: 'Record expense', href: '/dashboard/billing/new?kind=purchase_bill' }
      : null;
  return <OwnerShell companyName={org.name} accountLabel={(user.email ?? 'Account').split('@')[0] ?? 'Account'}
    accountEmail={user.email ?? ''} planLabel="Business workspace" navigation={nav}
    currentHref="/dashboard/finance" search="" dashboardBrand
    notificationsEnabled={grants.has('notification.view')}>
    <main className="fw-page" id="main-content" tabIndex={-1}>
      <div className="fw-crumb"><Link href="/dashboard">Dashboard</Link><span>/</span><strong>Finance</strong></div>
      <header className="fw-heading"><div><h1>Finance</h1><p>Manage invoices, expenses, GST and salaries. Keep your business finances organized.</p></div>
        {headlineAction && canCreate && <a className="fw-primary" href={headlineAction.href}>＋ {headlineAction.label}</a>}
      </header>
      <nav className="fw-tabs" aria-label="Finance sections">{tabs.map((t) =>
        <Link href={tabUrl(t.id, period)} key={t.id} aria-current={tab === t.id ? 'page' : undefined}
          className={tab === t.id ? 'fw-tab-active' : ''}>
          <OwnerIcon name={t.icon} size={17}/>{t.label}</Link>)}</nav>
      {tab === 'invoices' && <>
        <div className="fw-metrics">
          <Metric title="Total invoiced" value={money(issued.reduce((sum, d) => sum + Number(d.total), 0))} detail="Issued invoices in selected period" icon="billing"/>
          <Metric title="Paid" value="—" detail="Reconcile recorded customer receipts" icon="reports"/>
          <Metric title="Payment Pending" value="—" detail="Available after receipts are allocated" icon="expenses"/>
          <Metric title="Invoices" value={String(sales.length)} detail="Sales documents in selected period" icon="billing"/>
        </div>
        <div className="fw-register">
          <div className="fw-toolbar"><form action="/dashboard/finance" className="fw-search">
            <input type="hidden" name="tab" value={tab}/><input type="hidden" name="period" value={period}/>
            <OwnerIcon name="dashboard" size={16}/><input type="search" name="q" defaultValue={params.q ?? ''} placeholder="Search invoices or clients…" aria-label="Search invoices"/><button>Search</button>
          </form><form action="/dashboard/finance" className="fw-period"><input name="tab" type="hidden" value={tab}/>
            <select name="period" defaultValue={period} aria-label="Invoice date range">
              <option value="all">All dates</option><option value="month">This month</option><option value="quarter">Last 3 months</option><option value="year">Last 12 months</option>
            </select><button>Apply</button>
          </form></div>
          <div className="fw-table-wrap"><table><thead><tr><th>Invoice No.</th><th>Client</th><th>Date</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>{invoiceRows.map((d) => <tr key={d.id}><td><strong>{d.number ?? 'Draft'}</strong></td>
              <td>{d.partyName}</td><td>{fmtDate(d.date)}</td><td className="fw-money">{money(Number(d.total))}</td>
              <td><span className={'fw-status fw-' + d.status}>{d.status === 'issued' ? 'Issued' : 'Draft'}</span></td>
              <td><Link href={'/dashboard/billing/' + d.id}>View →</Link></td></tr>)}</tbody></table></div>
          <div className="fw-mobile-rows">{invoiceRows.map((d) => <Link key={d.id} className="fw-mobile-row" href={'/dashboard/billing/' + d.id}>
            <span><strong>{d.number ?? 'Draft'}</strong><small>{d.partyName} · {fmtDate(d.date)}</small></span>
            <span><strong>{money(Number(d.total))}</strong><small>{d.status === 'issued' ? 'Issued' : 'Draft'} ›</small></span>
          </Link>)}</div>
          {!invoiceRows.length && <Empty title="No sales invoices" detail="Create an invoice or change your search filters."/>}
          <p className="fw-footnote">Figures reflect the latest 100 billing documents. Issued does not mean paid; customer payment totals require verified receipt allocations.</p>
        </div>
      </>}
      {tab === 'expenses' && <>
        <div className="fw-metrics">
          <Metric title="Supplier bills" value={money(recorded.reduce((s, b) => s + Number(b.total), 0))} detail="Recorded bills (not proof of payment)" icon="expenses"/>
          <Metric title="Marketplace orders" value={String(acceptedOrders.length)} detail="Accepted orders imported automatically" icon="billing"/>
          <Metric title="Site labour paid" value={canPayments ? money(paidLabour.reduce((s, row) => s + Number(row.netAmount), 0)) : '—'} detail="From the existing labour register this month" icon="reports"/>
          <Metric title="Bills" value={String(bills.length)} detail="Company purchase documents" icon="expenses"/>
        </div>
        <div className="fw-panel"><div className="fw-panel-head"><div><h2>Expenses & supplier bills</h2><p>Marketplace purchases appear automatically. Add outside supplier bills once.</p></div>
          {canCreate && <a href="/dashboard/billing/new?kind=purchase_bill">＋ Add outside purchase</a>}</div>
          <div className="fw-table-wrap"><table><thead><tr><th>Supplier</th><th>Reference</th><th>Date</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead><tbody>
          {expenseRows.map((d) => <tr key={d.id}><td><strong>{d.partyName}</strong></td><td>{d.number ?? 'Draft'}</td><td>{fmtDate(d.date)}</td><td>{money(Number(d.total))}</td>
            <td><span className={'fw-status fw-' + d.status}>{d.status === 'recorded' ? 'Recorded' : 'Draft'}</span></td><td><Link href={'/dashboard/billing/' + d.id}>View →</Link></td></tr>)}
          </tbody></table></div>
          <div className="fw-mobile-rows">{expenseRows.map((d) => <Link className="fw-mobile-row" href={'/dashboard/billing/' + d.id} key={d.id}>
            <span><strong>{d.partyName}</strong><small>{d.number ?? 'Draft'} · {fmtDate(d.date)}</small></span><span><strong>{money(Number(d.total))}</strong><small>{d.status}</small></span></Link>)}</div>
          {!expenseRows.length && <Empty title="No supplier bills yet" detail="Record an outside purchase, or review marketplace orders below."/>}
        </div>
        {canMarketplace && <section className="fw-panel"><div className="fw-panel-head"><div><h2>Marketplace purchases</h2><p>Linked live to accepted orders. An order is not a recorded invoice or payment.</p></div>
          <Link href="/dashboard/marketplace/orders">View orders →</Link></div>
          {acceptedOrders.length ? <div className="fw-order-list">{acceptedOrders.map((o) => <div className="fw-order" key={o.id}>
            <span><strong>{o.productName}</strong><small>{o.sellerName} · {o.quantity} units · {fmtDate(o.createdAt)}</small></span>
            <span><strong>{money(Number(o.total))}</strong><small>Accepted marketplace order · verify supplier bill separately</small></span>
          </div>)}</div> : <p className="fw-muted">No accepted marketplace orders match your search.</p>}</section>}
        {canPayments && <section className="fw-panel"><div className="fw-panel-head"><div><h2>Project labour expenses</h2>
          <p>Single source: project work and labour-payment records. Never enter the same payment twice.</p></div>
          <Link href="/dashboard/billing/labour">View labour ledger →</Link></div>
          <p className="fw-muted">Site wages and curing/security-related labour are managed from Projects; this is a read-only finance summary.</p></section>}
      </>}
      {tab === 'gst' && <GstInline from={gstFrom} to={gstTo} rows={gstReports} invalid={gstInvalid}/>} 
      {tab === 'salaries' && <SalaryPanel organizationId={orgId}
        canRecord={grants.has('payment.record')} canView={canPayments}
        month={params.month}/>}
      <OwnerMobileNav navigation={bottomNav} currentHref="/dashboard/finance"/>
    </main>
  </OwnerShell>;
}
