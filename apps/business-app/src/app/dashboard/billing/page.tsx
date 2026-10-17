import Link from 'next/link';
import type { ReactNode } from 'react';
import { pageServices, activeOrganization } from '@business-os/auth/server';
import { createGstRepository, type GstDocumentRow } from '@business-os/database/gst';
import { createGstTemplatesRepository } from '@business-os/database/gst-templates';
import { ActionForm } from '@business-os/ui/action-form';
import { saveGstProfile } from './actions';
import { BillingProfileEditButton } from './billing-profile-edit-button';
import './billing-premium.css';

export const dynamic = 'force-dynamic';

const kinds = [
  { id: 'all', label: 'All documents' },
  { id: 'sales_invoice', label: 'Sales invoices' },
  { id: 'purchase_bill', label: 'Purchase bills' },
  { id: 'incoming', label: 'Marketplace incoming' },
] as const;
type Kind = (typeof kinds)[number]['id'];
type Period = 'all' | 'month' | 'quarter' | 'year';
const periods: {id: Period; label:string}[] = [
  {id:'month',label:'This month'},
  {id:'quarter',label:'Last 3 months'},
  {id:'year',label:'Last 12 months'},
  {id:'all',label:'All dates'},
];
const inr = (v:number) =>
  new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0})
    .format(Number.isFinite(v) ? v : 0);
const dateLabel = (v:string) => {
  const d = new Date(v + 'T00:00:00Z');
  return Number.isNaN(d.getTime()) ? v : new Intl.DateTimeFormat('en-IN',{
    day:'2-digit',month:'short',year:'numeric',timeZone:'UTC',
  }).format(d);
};
function periodStart(period:Period):string|null {
  if(period==='all') return null;
  const today = new Date();
  const start = new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),1));
  if(period==='quarter') start.setUTCMonth(start.getUTCMonth()-2);
  if(period==='year') start.setUTCMonth(start.getUTCMonth()-11);
  return start.toISOString().slice(0,10);
}
function statusLabel(status:string) {
  return status==='issued' ? 'Issued' : status==='recorded' ? 'Recorded' :
    status==='draft' ? 'Draft' : status;
}
function documentLabel(d:GstDocumentRow) {
  return d.kind === 'sales_invoice' ? 'Sales invoice' : 'Supplier bill';
}
function Icon({name}:{name:'invoice'|'bill'|'gst'|'documents'|'plus'|'arrow'|'calendar'|'bank'|'report'|'check'|'clock'|'search'|'location'|'list'}) {
  const common={fill:'none',stroke:'currentColor',strokeWidth:1.8,strokeLinecap:'round' as const,strokeLinejoin:'round' as const};
  const shape:Record<typeof name,ReactNode>={
    invoice:<><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z"/><path d="M9 8h6M9 12h6M9 16h4"/></>,
    bill:<><rect x="3" y="5" width="18" height="15" rx="3"/><path d="M3 10h18M7 15h6"/></>,
    gst:<><path d="M12 2 4 5v6c0 5 3.3 8.6 8 11 4.7-2.4 8-6 8-11V5l-8-3Z"/><path d="m8.5 12 2.5 2.5 4.5-5"/></>,
    documents:<><rect x="7" y="3" width="13" height="16" rx="2"/><path d="M4 7v13a2 2 0 0 0 2 2h11M10 8h7M10 12h7"/></>,
    plus:<path d="M12 5v14M5 12h14"/>,
    arrow:<path d="M5 12h14m-6-6 6 6-6 6"/>,
    calendar:<><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/></>,
    bank:<><path d="M3 10 12 4l9 6M4 10h16M5 19h14M3 22h18M7 11v8M12 11v8M17 11v8"/></>,
    report:<><path d="M5 3h14v18H5zM8 8h8M8 12h8M8 16h5"/></>,
    check:<path d="m5 12 4 4L19 6"/>,
    clock:<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    search:<><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></>,
    location:<><path d="M12 22s7-7.2 7-13a7 7 0 0 0-14 0c0 5.8 7 13 7 13Z"/><circle cx="12" cy="9" r="2"/></>,
    list:<><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></>,
  };
  return <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" {...common}>{shape[name]}</svg>;
}
function urlFor(kind:Kind,period:Period,q:string) {
  const p = new URLSearchParams();
  if(kind!=='all') p.set('kind',kind);
  if(period!=='all') p.set('period',period);
  if(q) p.set('q',q);
  const search=p.toString();
  return '/dashboard/billing'+(search?'?'+search:'');
}

export default async function BusinessBilling({
  searchParams,
}: {
  searchParams:Promise<{kind?:string;period?:string;q?:string}>;
}) {
  const {authorization,client} = await pageServices();
  const context=await activeOrganization();
  if(!context) return <main className="billing-v2 billing-unavailable">
    <h1>Billing</h1><p>Choose a company to view its billing register.</p>
    <Link href="/dashboard">Company dashboard</Link>
  </main>;
  await authorization.requirePermission(context.organizationId,'invoice.view');
  const {kind:kindParam,period:periodParam,q:qParam}=await searchParams;
  const kind:Kind=kinds.some(k=>k.id===kindParam)?kindParam as Kind:'all';
  const period:Period=periods.some(p=>p.id===periodParam)?periodParam as Period:'all';
  const q=(qParam??'').trim().slice(0,80);
  const gst=createGstRepository(client);
  const [profile,allDocs,filteredDocs,standard]=await Promise.all([
    gst.profile(context.organizationId),
    gst.list(context.organizationId,'all'),
    kind==='all'?Promise.resolve(null):gst.list(context.organizationId,kind),
    createGstTemplatesRepository(client).standard(context.organizationId),
  ]);
  // The overview already loaded the "all" register: avoid a duplicate RPC.
  const selectedDocs=filteredDocs??allDocs;
  const grants=new Set(context.grants.filter(g=>g.scope.kind==='organization').map(g=>g.permission));
  const canCreate=grants.has('invoice.create');
  const canManage=grants.has('billing.manage');
  const canPayments=grants.has('payment.view');
  const cutoff=periodStart(period);
  const keepDate=(d:GstDocumentRow)=>!cutoff||d.date>=cutoff;
  const inPeriod=allDocs.filter(keepDate);
  const docs=selectedDocs.filter(d=>keepDate(d)&&(!q||
    [d.number,d.partyName,d.kind,d.status].join(' ').toLowerCase().includes(q.toLowerCase())));
  const issued=inPeriod.filter(d=>d.kind==='sales_invoice'&&d.status==='issued');
  const purchase=inPeriod.filter(d=>d.kind==='purchase_bill'&&d.status==='recorded');
  const drafts=inPeriod.filter(d=>d.status==='draft');
  const salesValue=issued.reduce((sum,d)=>sum+Number(d.total),0);
  const purchasesValue=purchase.reduce((sum,d)=>sum+Number(d.total),0);
  const recent=[...inPeriod].sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt)).slice(0,5);
  const formField='billing-field';

  return <main id="main-content" className="billing-v2" tabIndex={-1}>
    <div className="billing-heading">
      <div>
        <p className="billing-eyebrow">FINANCE / BILLING</p>
        <h1>Billing</h1>
        <p>Manage invoices, supplier bills, GST details and financial records.</p>
      </div>
      <form action="/dashboard/billing" method="get" className="billing-period" aria-label="Billing date range">
        {kind!=='all'&&<input type="hidden" name="kind" value={kind}/>}
        {q&&<input type="hidden" name="q" value={q}/>}
        <Icon name="calendar"/>
        <select name="period" defaultValue={period} aria-label="Billing date range">
          {periods.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <button type="submit">Apply</button>
      </form>
    </div>

    <section className="billing-stats" aria-label="Billing summary">
      <div className="billing-stat">
        <span className="billing-stat-symbol warm"><Icon name="invoice"/></span>
        <div><p>Sales invoiced</p><strong>{inr(salesValue)}</strong><small>{issued.length} issued invoices in register</small></div>
      </div>
      <div className="billing-stat">
        <span className="billing-stat-symbol rose"><Icon name="bill"/></span>
        <div><p>Purchase bills</p><strong>{inr(purchasesValue)}</strong><small>{purchase.length} recorded bills in register</small></div>
      </div>
      <div className="billing-stat">
        <span className="billing-stat-symbol warm"><Icon name="documents"/></span>
        <div><p>Documents</p><strong>{inPeriod.length}</strong><small>In selected period</small></div>
      </div>
      <div className="billing-stat">
        <span className="billing-stat-symbol amber"><Icon name="clock"/></span>
        <div><p>Draft documents</p><strong>{drafts.length}</strong><small>Awaiting issue or recording</small></div>
      </div>
    </section>

    <p className="billing-coverage">Summary values reflect the latest 100 company billing documents; use finance reports for complete accounting totals.</p>

    <div className="billing-layout">
      <div className="billing-left">
        <section className="billing-panel billing-template">
          <div className="billing-panel-heading">
            <div><h2>Invoice design &amp; billing</h2><p>One consistent company billing format</p></div>
            <span className="billing-outline-tag"><Icon name="check"/> GST-ready template</span>
          </div>
          <div className="billing-template-grid">
            <div className="billing-template-feature">
              <div className="billing-template-top">
                <span className="billing-crown"><Icon name="invoice"/></span>
                <div><h3>{standard.name}</h3><span className="billing-current-tag">Current format</span></div>
              </div>
              <p>Professional invoices and supplier bills using your saved legal business details.</p>
              <div className="billing-template-state">
                <strong>{profile?'Billing identity configured':'Complete billing identity'}</strong>
                <small>{profile?'Ready to prepare your invoices':'Add your legal details before issuing invoices'}</small>
              </div>
              <div className="billing-template-buttons">
                {canCreate&&<Link href="/dashboard/billing/new?kind=sales_invoice" className="billing-primary"><Icon name="plus"/> New invoice</Link>}
                <a href="#profile" className="billing-secondary">Billing settings</a>
              </div>
            </div>
            <div className="billing-inclusions">
              <h3>Included in your billing workspace</h3>
              {['Sales invoices and supplier bills','HSN / SAC and GST calculations','CGST, SGST and IGST breakdown','Company-owned billing history','Printable finalized documents'].map(t=>
                <p key={t}><span><Icon name="check"/></span>{t}</p>)}
            </div>
            <div className="billing-illustration" aria-hidden="true">
              <div className="billing-skyline">
                <span/><span/><span/><span/><span/>
              </div>
              <div className="billing-illustration-caption"><Icon name="gst"/> Designed for Indian GST billing</div>
            </div>
          </div>
        </section>

        <section className="billing-panel billing-register" id="documents">
          <div className="billing-panel-heading">
            <div><h2>Invoices &amp; Bills</h2><p>Private company billing register</p></div>
            {canCreate&&<Link className="billing-small-link" href="/dashboard/billing/new"><Icon name="plus"/> New document</Link>}
          </div>
          <nav className="billing-tabs" aria-label="Document category">
            {kinds.map(k=><Link key={k.id} href={urlFor(k.id,period,q)}
              aria-current={kind===k.id?'page':undefined}
              className={kind===k.id?'active':''}>{k.label}</Link>)}
          </nav>
          <form action="/dashboard/billing" method="get" className="billing-document-search">
            {kind!=='all'&&<input type="hidden" name="kind" value={kind}/>}
            {period!=='all'&&<input type="hidden" name="period" value={period}/>}
            <Icon name="search"/>
            <input type="search" name="q" defaultValue={q} placeholder="Search invoice, supplier or number…" aria-label="Search billing documents" maxLength={80}/>
            <button type="submit">Search</button>
          </form>
          <div className="billing-table-wrap">
            <table>
              <thead><tr><th>Invoice / Bill</th><th>Party</th><th>Date</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>{docs.map(d=><tr key={d.id}>
                <td><strong>{d.number??'Draft'}</strong><small>{documentLabel(d)}</small></td>
                <td>{d.partyName}</td>
                <td>{dateLabel(d.date)}</td>
                <td className="billing-amount">{inr(Number(d.total))}</td>
                <td><span className={'billing-status billing-status-'+d.status}>{statusLabel(d.status)}</span></td>
                <td><Link className="billing-open" href={'/dashboard/billing/'+d.id}>Open <Icon name="arrow"/></Link></td>
              </tr>)}</tbody>
            </table>
          </div>
          <div className="billing-mobile-docs">{docs.map(d=>
            <Link key={d.id} href={'/dashboard/billing/'+d.id} className="billing-mobile-doc">
              <span className="billing-mobile-doc-top"><strong>{d.number??'Draft'}</strong><span className={'billing-status billing-status-'+d.status}>{statusLabel(d.status)}</span></span>
              <span className="billing-mobile-doc-party">{d.partyName}</span>
              <span className="billing-mobile-doc-foot"><span>{documentLabel(d)} · {dateLabel(d.date)}</span><strong>{inr(Number(d.total))}</strong></span>
            </Link>)}</div>
          {!docs.length&&<div className="billing-empty"><Icon name="documents"/><h3>No documents found</h3><p>Try another filter or create a new sales invoice or purchase bill.</p></div>}
          <div className="billing-register-footer">
            <span>Showing {docs.length} of the latest 100 documents for this category.</span>
            <Link href="/dashboard/billing/gst-reports">GST filing workpapers <Icon name="arrow"/></Link>
          </div>
        </section>

        <section className="billing-panel billing-tools">
          <div className="billing-panel-heading"><div><h2>Financial tools</h2><p>Continue into the existing accounting modules</p></div></div>
          <div className="billing-tools-grid">
            <Link href="/dashboard/billing/gst-reports" className="billing-tool">
              <span className="billing-tool-icon blue"><Icon name="report"/></span><span><strong>GST reports</strong><small>Prepare filing workpapers</small></span><Icon name="arrow"/>
            </Link>
            {canPayments&&<Link href="/dashboard/finance/payments" className="billing-tool">
              <span className="billing-tool-icon green"><Icon name="bank"/></span><span><strong>Payments &amp; receipts</strong><small>View recorded collections</small></span><Icon name="arrow"/>
            </Link>}
            <Link href="/dashboard/finance" className="billing-tool">
              <span className="billing-tool-icon amber"><Icon name="list"/></span><span><strong>Finance overview</strong><small>Contracts and billing milestones</small></span><Icon name="arrow"/>
            </Link>
          </div>
        </section>
      </div>

      <aside className="billing-right">
        <section className="billing-panel billing-profile" id="profile">
          <div className="billing-panel-heading"><div><h2>Billing Address &amp; GST</h2></div>
            {canManage&&<BillingProfileEditButton/>}
          </div>
          <div className="billing-profile-row"><span className="billing-profile-icon"><Icon name="location"/></span>
            <div><strong>{profile?.legalName??'Billing identity not configured'}</strong><p>{profile?.address??'Add your registered legal business address.'}</p><small>State code: {profile?.stateCode??'—'}</small></div>
          </div>
          <div className="billing-profile-row"><span className="billing-profile-icon"><Icon name="gst"/></span>
            <div><strong>GSTIN</strong><p>{profile?.gstin??'Not registered in this workspace'}</p>
              {profile?.authorizedSignatory&&<small>Signatory: {profile.authorizedSignatory}</small>}
            </div>
          </div>
          {canManage&&<details className="billing-profile-edit" id="billing-profile-edit" open={!profile}>
            <summary>{profile?'Edit business billing identity':'Set up billing identity'} <span>⌄</span></summary>
            <p>These details are frozen into documents once they are issued.</p>
            <ActionForm action={saveGstProfile} label="Save billing identity">
              <div className="billing-form-grid">
                <label>Legal business name<input required name="legalName" minLength={2} maxLength={200} defaultValue={profile?.legalName??''} className={formField}/></label>
                <label>State code<input required name="stateCode" pattern="[0-9]{2}" maxLength={2} defaultValue={profile?.stateCode??'36'} className={formField}/></label>
                <label>GSTIN (optional)<input name="gstin" maxLength={15} defaultValue={profile?.gstin??''} placeholder="36ABCDE1234F1Z5" className={formField}/></label>
                <label>Authorized signatory<input name="authorizedSignatory" maxLength={150} defaultValue={profile?.authorizedSignatory??''} className={formField}/></label>
                <label className="billing-form-address">Registered billing address<textarea required name="address" minLength={5} maxLength={1000} rows={3} defaultValue={profile?.address??''} className={formField}/></label>
              </div>
            </ActionForm>
          </details>}
        </section>

        <section className="billing-panel billing-quick">
          <div className="billing-panel-heading"><div><h2>Quick actions</h2></div></div>
          {canCreate&&<Link href="/dashboard/billing/new?kind=sales_invoice"><span className="billing-quick-icon"><Icon name="invoice"/></span><span><strong>Create sales invoice</strong><small>Prepare a new customer invoice</small></span><Icon name="arrow"/></Link>}
          {canCreate&&<Link href="/dashboard/billing/new?kind=purchase_bill"><span className="billing-quick-icon"><Icon name="bill"/></span><span><strong>Record supplier bill</strong><small>Register a received bill</small></span><Icon name="arrow"/></Link>}
          <Link href="/dashboard/billing/gst-reports"><span className="billing-quick-icon"><Icon name="report"/></span><span><strong>GST workpapers</strong><small>Review tax components</small></span><Icon name="arrow"/></Link>
          {canPayments&&<Link href="/dashboard/finance/payment_methods"><span className="billing-quick-icon"><Icon name="bank"/></span><span><strong>Payment methods</strong><small>View existing finance settings</small></span><Icon name="arrow"/></Link>}
        </section>

        <section className="billing-panel billing-activity">
          <div className="billing-panel-heading"><div><h2>Recent documents</h2></div>
            <a href="#documents" className="billing-small-link">View all</a></div>
          {recent.length?recent.map(d=><Link href={'/dashboard/billing/'+d.id} key={d.id} className="billing-activity-item">
            <span className={'billing-activity-icon '+(d.kind==='sales_invoice'?'sales':'purchase')}><Icon name={d.kind==='sales_invoice'?'invoice':'bill'}/></span>
            <span className="billing-activity-info"><strong>{d.partyName}</strong><small>{d.number??documentLabel(d)} · {dateLabel(d.date)}</small></span>
            <span className="billing-activity-meta"><strong>{inr(Number(d.total))}</strong><small className={'billing-status billing-status-'+d.status}>{statusLabel(d.status)}</small></span>
          </Link>):<p className="billing-no-activity">No invoices or bills have been recorded in this period.</p>}
        </section>
      </aside>
    </div>
    <p className="billing-disclaimer">These GST-ready records do not file tax returns, generate government e-invoice IRNs or verify statutory tax classifications. Review details with your accountant before issuing statutory documents.</p>
  </main>;
}
