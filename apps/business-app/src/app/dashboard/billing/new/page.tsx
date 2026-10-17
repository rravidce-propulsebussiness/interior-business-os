import Link from 'next/link';
import { notFound } from 'next/navigation';
import { canAccess } from '@business-os/auth';
import { activeOrganization, pageServices } from '@business-os/auth/server';
import { createGstRepository, type GstDocument } from '@business-os/database/gst';
import { createMarketplaceRepository } from '@business-os/database/marketplace';
import { createGstTemplatesRepository } from '@business-os/database/gst-templates';
import { DocumentEditor } from '../document-editor';
import { PremiumSalesInvoice } from '../premium-sales-invoice';
import { invoiceStageChoices } from '../stage-choices';
import { invoiceCustomerChoices } from '../customer-choices';
import { OwnerShell, type OwnerNavItem } from '../../owner-shell';
import '../../owner-dashboard.css';

export const dynamic = 'force-dynamic';

export default async function PrepareDocument({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; order?: string; error?: string;
    kind?: string; lead?: string }>;
}) {
  const params = await searchParams;
  // Authenticate before selecting the company, preserving the login redirect
  // for expired sessions instead of raising an unhandled DomainError.
  const { authorization, client, user: account } = await pageServices();
  const context = await activeOrganization();
  if (!context) notFound();
  await authorization.requirePermission(context.organizationId, 'invoice.create');
  const gst = createGstRepository(client);
  const profile = await gst.profile(context.organizationId);
  const templatesRepo = createGstTemplatesRepository(client);
  const standard = await templatesRepo.standard(context.organizationId);
  let existing: GstDocument | null = null;
  if (params.edit) {
    existing = await gst.document(context.organizationId, params.edit);
    if (!existing.isOwner || existing.status !== 'draft') notFound();
    await authorization.requirePermission(context.organizationId, 'invoice.manage');
  }
  const existingLayout = existing
    ? await templatesRepo.documentLayout(context.organizationId, existing.id)
    : null;
  let order: null | { id:string;productName:string;buyerName:string;
    quantity:number;unitPrice:number } = null;
  if (params.order) {
    await authorization.requirePermission(context.organizationId, 'catalog.manage');
    const orders = await createMarketplaceRepository(client).orders(
      context.organizationId, 'seller');
    const matched = orders.find(o => o.id===params.order && o.status==='accepted');
    if (!matched) notFound();
    order = { id:matched.id,productName:matched.productName,
      buyerName:matched.buyerName,quantity:Number(matched.quantity),
      unitPrice:Number(matched.unitPrice) };
  }
  const purchase = existing?.kind === 'purchase_bill' ||
    (!existing && params.kind === 'purchase_bill');
  const hasGrant = (key:string) =>
    context.grants.some(g=>g.scope.kind==='organization'&&g.permission===key);
  const stageContext = existing && !purchase
    ? await gst.stageContext(context.organizationId,existing.id).catch(()=>null)
    : null;
  const eligible = !purchase && !order &&
    hasGrant('lead.view') && hasGrant('lead.convert') &&
    hasGrant('project.view');
  const eligibleOptions = eligible
    ? await gst.stageOptions(context.organizationId)
    : [];
  const choices = invoiceStageChoices(eligibleOptions,profile?.stateCode??'36');
  // The invoice picker must include ordinary CRM clients, not just the few
  // closed-won leads that have approved quotation payment plans.
  const canViewCustomers = canAccess(context, {
    organizationId: context.organizationId,
    permission: 'customer.view',
    moduleKey: 'customers',
  });
  const customerResponse = !purchase && !order && canViewCustomers
    ? await client.from('customers')
        .select('id,display_name,legal_name,phone,email,tax_identifier,billing_address')
        .eq('organization_id',context.organizationId)
        .eq('status','active')
        .eq('is_sales_prospect',false)
        .order('display_name',{ascending:true})
        .limit(1000)
    : { data:[], error:null };
  if (customerResponse.error) {
    throw new Error('Unable to load existing clients for invoices');
  }
  const customers = invoiceCustomerChoices(
    customerResponse.data ?? [],choices,profile?.stateCode??'36',
  );
  const existingCustomerId = existing && !purchase && !order
    ? await gst.customerContext(context.organizationId, existing.id)
    : null;
  const company = await client.from('organizations').select('name')
    .eq('id', context.organizationId).maybeSingle();
  const navigation:OwnerNavItem[] = [
    {label:'Dashboard',href:'/dashboard',icon:'dashboard'},
    ...(hasGrant('lead.view')?[{label:'Leads',href:'/dashboard/crm/leads',icon:'leads' as const}]:[]),
    ...(hasGrant('quotation.view')?[{label:'Quotations',href:'/dashboard/quotations',icon:'quotations' as const}]:[]),
    ...(hasGrant('project.view')?[{label:'Projects',href:'/dashboard/projects',icon:'projects' as const}]:[]),
    {label:'Billing',href:'/dashboard/billing',icon:'billing'},
    ...(hasGrant('payment.view')?[{label:'Finance',href:'/dashboard/finance',icon:'expenses' as const}]:[]),
    {label:'Settings',href:'/dashboard/settings',icon:'settings'},
  ];
  return <OwnerShell companyName={company.data?.name??profile?.legalName??'Business OS'}
    accountLabel={(account.email??'Account').split('@')[0]??'Account'}
    accountEmail={account.email??''} planLabel="Business workspace"
    navigation={navigation} search="" currentHref="/dashboard/billing"
    notificationsEnabled={hasGrant('notification.view')}>
    {params.error && <div role="alert" style={{
      background:'#fff1f2',border:'1px solid #fecdd3',padding:14,
      margin:'15px 24px',borderRadius:12,color:'#9f1239',fontSize:13,
    }}>The invoice could not be saved: {params.error}</div>}
    {!profile ? <main className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-bold">Set up your billing identity</h1>
      <p className="my-3 text-sm">Company legal name, billing address and state code are required before preparing invoices.</p>
      <Link href="/dashboard/settings?tab=invoice" className="text-orange-600 underline">Configure billing identity →</Link>
    </main> : purchase || !!order ? <main id="main-content"
      className="mx-auto max-w-7xl space-y-5 px-4 py-8 text-slate-900 sm:px-7">
      <Link href="/dashboard/billing" className="text-sm text-slate-500">← Billing</Link>
      <h1 className="text-2xl font-extrabold">{purchase?'Supplier purchase bill':'Marketplace invoice'}</h1>
      <DocumentEditor existing={existing} order={order} profile={profile}
        standard={standard} existingLayout={existingLayout}
        requestedKind={purchase?'purchase_bill':'sales_invoice'}/>
    </main> : <PremiumSalesInvoice profile={profile} standard={standard}
      existing={existing} stageContext={stageContext} choices={choices}
      customers={customers} customerAccess={canViewCustomers}
      existingCustomerId={existingCustomerId}
      initialLead={params.lead??''}/>}
  </OwnerShell>;
}
