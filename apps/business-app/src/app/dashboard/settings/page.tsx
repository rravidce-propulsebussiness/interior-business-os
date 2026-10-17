import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { canAccess } from '@business-os/auth';
import { activeOrganization, pageServices } from '@business-os/auth/server';
import { emptyAddress } from '@business-os/core/commercial';
import { createGstRepository } from '@business-os/database/gst';
import { ActionForm } from '@business-os/ui/action-form';
import { MasterForm } from '../commercial/master-form';
import { ApplyBrandingToDrafts } from '../quotations/apply-branding-to-drafts';
import { saveGstProfile } from '../billing/actions';
import { OwnerShell, type OwnerNavItem } from '../owner-shell';
import { saveCompanySettings } from './actions';
import { companyCategoryOptions } from './company-categories';
import '../owner-dashboard.css';
import './settings.css';
import { InvoiceTemplateSelector } from './template-selector';

export const dynamic='force-dynamic';
type Tab='company'|'branding'|'invoice'|'documents'|'payments'|'team'|'preferences';
const tabs:{id:Tab;label:string;icon:string}[]=[
  {id:'company',label:'Company Details',icon:'▣'},
  {id:'branding',label:'Branding',icon:'◈'},
  {id:'invoice',label:'Invoice & GST',icon:'▤'},
  {id:'documents',label:'Documents',icon:'▧'},
  {id:'payments',label:'Payment Settings',icon:'♧'},
  {id:'team',label:'Team & Access',icon:'♙'},
  {id:'preferences',label:'Preferences',icon:'⚙'},
];
const sourceSchema=z.object({
 description:z.string().nullable().optional(),
 phone:z.string().nullable().optional(),
 services:z.array(z.object({industry:z.string(),service:z.string()})).optional(),
 locations:z.array(z.object({city:z.string(),state:z.string()})).optional(),
 syncedAt:z.string(),
});
const identitySchema=z.object({
 tradeName:z.string().optional(),businessType:z.string().optional(),
 pan:z.string().optional(),cin:z.string().optional(),phone:z.string().optional(),
 email:z.string().optional(),website:z.string().optional(),
 address:z.string().optional(),city:z.string().optional(),
 state:z.string().optional(),pin:z.string().optional(),
 categories:z.array(z.string()).optional(),bankHolder:z.string().optional(),
 bankAccount:z.string().optional(),bankIfsc:z.string().optional(),
 bankName:z.string().optional(),bankBranch:z.string().optional(),
});
function Field({name,label,value,required=false,type='text',maxLength=200,placeholder=''}:{
 name:string;label:string;value?:string|null|undefined;required?:boolean;
 type?:string;maxLength?:number;placeholder?:string;
}){
 return <label className="us-field"><span>{label}{required&&<em> *</em>}</span>
  <input name={name} defaultValue={value??''} required={required} type={type}
   maxLength={maxLength} placeholder={placeholder}/></label>;
}
function Header({icon,title,detail,extra}:{
 icon:string;title:string;detail:string;extra?:React.ReactNode;
}){
 return <div className="us-card-heading"><span className="us-card-icon">{icon}</span>
  <div><h2>{title}</h2><p>{detail}</p></div>{extra&&<div className="us-extra">{extra}</div>}
 </div>;
}
function Cards({items}:{items:{label:string;href:string}[]}){
 return <div className="us-link-cards">{items.map(i=><Link key={i.href} href={i.href}>{i.label}<b>→</b></Link>)}</div>;
}
export default async function SettingsPage({searchParams}:{
 searchParams:Promise<{tab?:string;status?:string}>;
}){
 const params=await searchParams;
 const tab=tabs.find(t=>t.id===params.tab)?.id??'company';
 const context=await activeOrganization();
 if(!context)notFound();
 const {repository,client,authorization}=await pageServices();
 const has=(permission:string,moduleKey?:string)=>canAccess(context,{
   organizationId:context.organizationId,permission,...(moduleKey?{moduleKey}:{}),
 });
 if(!has('organization.view'))notFound();
 const canEdit=has('organization.manage');
 const canBrand=has('settings.manage','quotation');
 const canBilling=has('billing.manage');
 const [org,sourceRaw,user,privateResponse,brandResponse,invoiceProfile]=await Promise.all([
  repository.organization(context.organizationId),
  repository.propulseCompanyProfile(context.organizationId),
  authorization.requireAuthenticatedUser(),
  canEdit?client.rpc('organization_identity_settings_read',{p_org:context.organizationId})
    :Promise.resolve({data:null,error:null}),
  canBrand?client.from('organization_quotation_settings').select('*')
    .eq('organization_id',context.organizationId).maybeSingle()
    :Promise.resolve({data:null,error:null}),
  canBilling||has('billing.view')?createGstRepository(client).profile(context.organizationId)
    :Promise.resolve(null),
 ]);
 if(!org)notFound();
 if(privateResponse.error||brandResponse.error)throw new Error('Settings could not load');
 const parsed=identitySchema.safeParse(privateResponse.data);
 const identity=parsed.success?parsed.data:{};
 const source=sourceSchema.safeParse(sourceRaw);
 const synced=source.success?source.data:null;
 const phone=identity.phone??synced?.phone??'';
 const city=identity.city??synced?.locations?.[0]?.city??'';
 const state=identity.state??synced?.locations?.[0]?.state??'';
 const industries=(synced?.services??[]).map(s=>s.industry+' '+s.service).join(' ').toLowerCase();
 const suggested=companyCategoryOptions.filter(c=>
   c.includes('Construction')?industries.includes('construct'):
   c.includes('Interior')?industries.includes('interior'):
   c.includes('Renovation')?industries.includes('renovat'):
   c.includes('Real Estate')?industries.includes('real estate'):
   c.includes('Structural')?industries.includes('structur'):
   c.includes('Project Management')?industries.includes('project'):false
 );
 const selected=identity.categories??suggested;
 const displayName=identity.tradeName||org.name;
 const savedBrand=brandResponse.data as Record<string,unknown>|null;
 const original=savedBrand?.branding&&typeof savedBrand.branding==='object'?
  savedBrand.branding as Record<string,unknown>:{};
 const address=original.address&&typeof original.address==='object'?
  original.address as Record<string,unknown>:{};
 const branding={
  ...original,name:displayName,phone:phone||original.phone||'',
  email:identity.email||original.email||'',
  tax_identifier:invoiceProfile?.gstin||original.tax_identifier||'',
  accent:original.accent||'#fb5a19',
  logo_data_uri:original.logo_data_uri||'',
  cover_image_data_uri:original.cover_image_data_uri||'',
  detail_image_data_uri:original.detail_image_data_uri||'',
  materials_image_data_uri:original.materials_image_data_uri||'',
  address:{...emptyAddress,...address,
   line1:identity.address||address.line1||'',city:city||address.city||'',
   region:state||address.region||'',postal_code:identity.pin||address.postal_code||'',
   country_code:'IN'},
 };
 const brandInitial:Record<string,unknown>=savedBrand?
  {...savedBrand,branding}:{
   organization_id:context.organizationId,version:1,prefix:'Q',
   validity_days:30,default_terms:'',default_customer_notes:'',
   show_quantity:true,show_unit_rate:true,show_specifications:true,branding,
  };
 let drafts:{id:string;version:number;quotationNumber:string}[]=[];
 const canRefresh=has('quotation.edit','quotation');
 if(tab==='branding'&&canBrand&&canRefresh){
  const {data:pending}=await client.from('quotation_revisions')
   .select('id,version,quotation_id').eq('organization_id',context.organizationId)
   .eq('status','draft').order('created_at',{ascending:false}).limit(30);
  const ids=(pending??[]).map(d=>d.quotation_id);
  const {data:names}=ids.length?await client.from('quotations').select('id,quotation_number')
   .eq('organization_id',context.organizationId).in('id',ids):{data:[]};
  const labels=new Map((names??[]).map(row=>[row.id,row.quotation_number]));
  drafts=(pending??[]).map(d=>({id:d.id,version:d.version,
    quotationNumber:labels.get(d.quotation_id)??'Draft quotation'}));
 }
 const navigation:OwnerNavItem[]=[
  {label:'Dashboard',href:'/dashboard',icon:'dashboard'},
  ...(has('lead.view','crm')?[{label:'Leads',href:'/dashboard/crm/leads',icon:'leads' as const}]:[]),
  ...(has('quotation.view','quotation')?[{label:'Quotations',href:'/dashboard/quotations',icon:'quotations' as const}]:[]),
  ...(has('project.view','projects')?[{label:'Projects',href:'/dashboard/projects',icon:'projects' as const}]:[]),
  ...(has('billing.view')?[{label:'Finance',href:'/dashboard/finance',icon:'billing' as const}]:[]),
  ...(has('team.manage')?[{label:'Employees',href:'/dashboard/employees',icon:'team' as const}]:[]),
  ...((has('team.view')||has('role.view'))?[{label:'Team',href:'/dashboard/company/team',icon:'team' as const}]:[]),
  {label:'Settings',href:'/dashboard/settings',icon:'settings'},
 ];
 const logo=typeof branding.logo_data_uri==='string'&&
   /^data:image\/(?:png|jpeg);base64,/.test(branding.logo_data_uri)?branding.logo_data_uri:null;
 return <OwnerShell companyName={org.name} accountLabel={(user.email??'Account').split('@')[0]||'Account'}
   accountEmail={user.email??''} planLabel="Business workspace" navigation={navigation}
   search="" currentHref="/dashboard/settings" notificationsEnabled={has('notification.view')}>
  <main id="main-content" className="us-shell">
   <p className="us-breadcrumb"><Link href="/dashboard">⌂</Link> › Settings</p>
   <header className="us-heading"><h1>Settings</h1><p>Manage your company profile, branding, invoice details and preferences.</p></header>
   <nav className="us-tabs" aria-label="Settings categories">{tabs.filter(t=>
     t.id!=='branding'||canBrand).filter(t=>t.id!=='invoice'||canBilling||has('billing.view'))
     .filter(t=>t.id!=='team'||has('team.view')||has('role.view')).map(t=>
       <Link key={t.id} aria-current={tab===t.id?'page':undefined}
         className={tab===t.id?'selected':''} href={'/dashboard/settings?tab='+t.id}>
         <span>{t.icon}</span>{t.label}</Link>)}</nav>
   {params.status&&tab==='company'&&<p role="status" className={'us-status '+(params.status==='saved'?'ok':'bad')}>
     {params.status==='saved'?'Company details saved.':
      params.status==='invalid'?'Some entries were invalid. Check email, PIN, PAN and bank details.':
      params.status==='forbidden'?'You do not have permission to edit these details.':
      'Save failed. Please try again.'}</p>}
   {tab==='company'&&<div className="us-columns">
    <form action={saveCompanySettings} className="us-stack">
     <section className="us-card">
      <Header icon="▣" title="Company Information"
       detail="Details used across quotations, invoices and business communication."
       extra={synced?<span className="us-synced">✓ Synced from ProPulse</span>:undefined}/>
      <div className="us-grid">
       <div className="us-field"><span>ProPulse registered company</span><div className="us-readonly">{org.name}</div></div>
       <Field name="businessType" label="Business type" value={identity.businessType} placeholder="Proprietorship, LLP, Private Limited"/>
       <Field name="tradeName" label="Trade name / display name" value={displayName}/>
       <Field name="pan" label="PAN number" value={identity.pan} maxLength={10}/>
       <Field name="cin" label="CIN (optional)" value={identity.cin} maxLength={25}/>
       <Field name="phone" label="Phone number" type="tel" value={phone}/>
       <Field name="email" label="Email address" type="email" value={identity.email} maxLength={254}/>
       <Field name="website" label="Website (optional)" type="url" value={identity.website} maxLength={255} placeholder="https://"/>
       <label className="us-field us-full"><span>Registered address</span>
        <textarea name="address" rows={3} maxLength={1000} defaultValue={identity.address??''} /></label>
       <Field name="state" label="State" value={state} maxLength={100}/>
       <Field name="city" label="City" value={city} maxLength={100}/>
       <Field name="pin" label="PIN code" value={identity.pin} maxLength={6}/>
      </div>
     </section>
     <section className="us-card">
      <Header icon="▧" title="Business Categories" detail="Choose the services your company provides."/>
      <div className="us-categories">{companyCategoryOptions.map(c=><label key={c}>
       <input type="checkbox" name="categories" value={c} defaultChecked={selected.includes(c)}
        disabled={!canEdit}/>{c}</label>)}</div>
     </section>
     <section className="us-card" id="bank-details">
      <Header icon="▤" title="Bank Details (for payments)"
       detail="Private bank information visible only to authorized company managers."/>
      <div className="us-grid">
       <Field name="bankHolder" label="Account holder name" value={identity.bankHolder}/>
       <Field name="bankAccount" label="Account number" value={identity.bankAccount} maxLength={34}/>
       <Field name="bankIfsc" label="IFSC code" value={identity.bankIfsc} maxLength={11}/>
       <Field name="bankName" label="Bank name" value={identity.bankName}/>
       <Field name="bankBranch" label="Branch" value={identity.bankBranch}/>
      </div>
     </section>
     {canEdit&&<div className="us-actions"><Link href="/dashboard" className="us-cancel">Cancel</Link>
       <button type="submit" className="us-save">Save changes →</button></div>}
    </form>
    <aside className="us-preview"><section className="us-card">
     <Header icon="◈" title="Company preview" detail="How saved details identify your business."/>
     <div className="us-company-preview">
      <div className="us-mark">{logo?<img src={logo} width={90} height={90} alt="Company logo"/>:
       <strong>{displayName.slice(0,1).toUpperCase()}</strong>}</div>
      <h3>{displayName}</h3><p>{selected.slice(0,2).join(' · ')||'Business identity'}</p>
      <div className="us-contact">
       <div>⌖ {identity.address||city||'Company address not set'}</div>
       <div>☎ {phone||'Contact number not set'}</div>
       <div>✉ {identity.email||'Contact email not set'}</div>
       <div>↗ {identity.website||'Website not set'}</div>
       <div>GSTIN: {invoiceProfile?.gstin||'Configure under Invoice & GST'}</div>
      </div>
     </div>
     <p className="us-info">ProPulse sync imports available company name, phone, services and service locations. Other details are maintained here.</p>
     <Link className="us-sync" href="/auth/propulse">↻ Reconnect ProPulse to refresh</Link>
     {synced&&<small className="us-updated">Last linked sync: {new Date(synced.syncedAt).toLocaleDateString('en-IN')}</small>}
    </section></aside>
   </div>}
   {tab==='branding'&&<div className="us-columns">
    <div className="us-stack"><section className="us-card">
     <Header icon="◈" title="Branding & Quotation Design"
       detail="Customize your company's logo, colors and quotation template."/>
     {canBrand?<div className="us-master">
      <MasterForm entity="organization_quotation_settings" initial={brandInitial}
       title="Save branding" fields={[
        {key:'branding.logo_data_uri',label:'Upload company logo',type:'file'},
        {key:'branding.cover_image_data_uri',label:'Quotation cover photograph',type:'file',fileMaxBytes:62000},
        {key:'branding.detail_image_data_uri',label:'Project / specification photograph',type:'file',fileMaxBytes:39000},
        {key:'branding.materials_image_data_uri',label:'Materials photograph',type:'file',fileMaxBytes:42000},
        {key:'branding.accent',label:'Brand accent color (hex)'},
        {key:'prefix',label:'Quotation number prefix',required:true},
        {key:'validity_days',label:'Validity in days',type:'number'},
        {key:'show_quantity',label:'Show quantities',type:'checkbox'},
        {key:'show_unit_rate',label:'Show unit rates',type:'checkbox'},
        {key:'show_specifications',label:'Show specifications',type:'checkbox'},
        {key:'default_terms',label:'Default quotation terms',type:'textarea'},
        {key:'default_customer_notes',label:'Default customer notes',type:'textarea'},
       ]}/>
      </div>:<p>You need quotation settings permission to update branding.</p>}
    </section>
    {canBrand&&has('quotation.edit','quotation')&&<section className="us-card">
     <Header icon="↻" title="Update draft branding"
       detail="Existing issued documents remain unchanged. Select drafts to refresh."/>
     <ApplyBrandingToDrafts drafts={drafts}/>
    </section>}</div>
    <aside className="us-preview"><section className="us-card"><Header icon="◈"
      title="Document preview" detail="Identity used for your branded documents"/>
      <div className="us-company-preview"><div className="us-mark">
       {logo?<img src={logo} alt="Saved logo" width={90} height={90}/>:<strong>{displayName[0]}</strong>}
       </div><h3>{displayName}</h3><p>{identity.address||city||'Add your business address'}</p></div>
       <p className="us-info">Business name and contact details are taken from Company Details when saving this branding. Drafts can be refreshed individually.</p>
    </section></aside>
   </div>}
   {tab==='invoice'&&<div className="us-columns">
    <section className="us-card us-wide">
      <Header icon="▤" title="Invoice design & templates" detail="Choose the default design for new sales invoices. Existing issued invoices keep their original appearance."/>
      <p className="us-info">Customize your company invoice appearance in Settings, not the Finance register. Invoice templates are shared platform presets with a company-specific selection.</p>
      <InvoiceTemplateSelector organizationId={context.organizationId} canManage={canBilling}/>
    </section>
    <section className="us-card"><Header icon="▤" title="Invoice & GST identity"
      detail="Official legal name, registered address and GST information."/>
     {canBilling?<div className="us-invoice-form"><ActionForm action={saveGstProfile} label="Save billing identity">
      <div className="us-grid">
       <Field required name="legalName" label="Legal company name" value={invoiceProfile?.legalName||org.legal_name||org.name}/>
       <Field required name="stateCode" label="GST state code" maxLength={2} value={invoiceProfile?.stateCode||(state.toLowerCase()==='telangana'?'36':'')}/>
       <Field name="gstin" label="GSTIN (optional)" maxLength={15} value={invoiceProfile?.gstin}/>
       <Field name="authorizedSignatory" label="Authorized signatory" value={invoiceProfile?.authorizedSignatory}/>
       <label className="us-field us-full"><span>Registered billing address *</span>
        <textarea name="address" required minLength={5} maxLength={1000} rows={3}
          defaultValue={invoiceProfile?.address||[identity.address,city,state,identity.pin].filter(Boolean).join(', ')}/></label>
      </div>
     </ActionForm></div>:<p>Only authorized billing managers can edit this identity.</p>}
     <p className="us-info">Tax details are verified when saving; issued invoices preserve their original business identity.</p>
    </section>
    <aside className="us-preview"><section className="us-card">
     <Header icon="▤" title="Invoice preview" detail="Current billing identity"/>
     <div className="us-company-preview"><h3>{invoiceProfile?.legalName||org.name}</h3>
      <p>{invoiceProfile?.address||identity.address||'Business address not set'}</p>
      <div className="us-contact"><div>GSTIN: {invoiceProfile?.gstin||'Not set'}</div>
       <div>State: {invoiceProfile?.stateCode||'Not set'}</div></div>
     </div>
     <Link href="/dashboard/billing/new?kind=sales_invoice" className="us-sync">Create sales invoice →</Link>
    </section></aside>
   </div>}
   {tab==='documents'&&<section className="us-card us-wide">
    <Header icon="▧" title="Documents & Records" detail="Secure company documents remain in their existing modules."/>
    <Cards items={[{label:'Quotation PDFs and approvals',href:'/dashboard/quotations'},
     {label:'Invoices and purchase bills',href:'/dashboard/finance'},
     {label:'Project plans, contracts and attachments',href:'/dashboard/projects'}]}/>
    <p className="us-info">No duplicate document store or permission bypass is created in Settings.</p>
   </section>}
   {tab==='payments'&&<section className="us-card us-wide">
    <Header icon="♧" title="Payment Settings" detail="Configure accounts and collection options."/>
    <Cards items={[{label:'Edit company bank details',href:'/dashboard/settings?tab=company#bank-details'},
     {label:'Payment methods',href:'/dashboard/finance/payment_methods'},
     {label:'Invoices & stage collections',href:'/dashboard/finance'}]}/>
   </section>}
   {tab==='team'&&<section className="us-card us-wide">
    <Header icon="♙" title="Team & Access" detail="Manage employees, roles and permissions."/>
    <Cards items={[{label:'Manage team and invitations',href:'/dashboard/company/team'}]}/>
   </section>}
   {tab==='preferences'&&<section className="us-card us-wide">
    <Header icon="⚙" title="Workspace Preferences" detail="Your current company defaults."/>
    <div className="us-grid"><div className="us-field"><span>Currency</span><div className="us-readonly">{org.default_currency}</div></div>
      <div className="us-field"><span>Time zone</span><div className="us-readonly">{org.default_timezone}</div></div>
      <div className="us-field"><span>Workspace status</span><div className="us-readonly">{org.status}</div></div>
      <div className="us-field"><span>ProPulse connection</span><div className="us-readonly">{synced?'Connected':'Not connected'}</div></div></div>
    <Cards items={[{label:'Automation settings',href:'/dashboard/automations/settings'},
      {label:'Website studio',href:'/dashboard/website'}]}/>
   </section>}
  </main>
 </OwnerShell>;
}
