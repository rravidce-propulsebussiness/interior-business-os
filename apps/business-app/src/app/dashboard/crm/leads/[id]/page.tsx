import Link from 'next/link';
import { notFound } from 'next/navigation';
import { idSchema } from '@business-os/shared';
import { crmSchemas } from '@business-os/core/crm';
import { MasterForm, type Field } from '../../../commercial/master-form';
import { crmServices, resultSchema, optionRows } from '../../service';
import { lookups, leadFields, pageNumber, type Params } from '../../lookups';
import { saveCrm } from '../../actions';
import { Pagination } from '../../pagination';
import { OwnerShell, type OwnerNavItem } from '../../../owner-shell';
import { leadsNavigation } from '../../../leads-navigation';
import { LeadHistoryTimeline, type LeadHistoryItem } from '../lead-history-timeline';
import { LeadUpdateComposer } from '../lead-update-composer';
import { LeadActivityScheduler } from '../lead-activity-scheduler';
import { LeadStageSelect, LeadAssigneeSelect, LeadFollowUpSetter } from '../lead-inline-controls';
import { LeadQuotePreview } from '../lead-quote-preview';
import { LeadCategoryEditor } from './lead-category-editor';
import {
  leadCategoryLabel, leadRequirementLabel, resolveLeadCategory,
} from '../lead-category';
import { leadServiceFromIndustryKey } from '../lead-service-options';
import type { LeadOption, LeadStage, LeadView } from '../workspace';
import '../../../owner-dashboard.css';
import '../leads.css';
import './lead-history.css';
import '../lead-category.css';
import '../leads-activity.css';

export const dynamic = 'force-dynamic';

export default async function LeadDetail({
  params, searchParams,
}: {
  params: Promise<{ id:string }>;
  searchParams: Promise<Params>;
}) {
  const {id}=await params;
  idSchema.parse(id);
  const p=await searchParams;
  const s=await crmServices('lead.view',true);
  const {data:l,error}=await s.client.from('leads').select('*')
    .eq('organization_id',s.org).eq('id',id).maybeSingle();
  if(error||!l)notFound();

  const [choices, activity, organization, user, plans, memberships, industries] =
    await Promise.all([
      lookups(s,p),
      s.crm.search('lead_activities',{lead_id:id},pageNumber(p.page)),
      s.repository.organization(s.org),
      s.authorization.requireAuthenticatedUser(),
      s.repository.plans().catch(()=>null),
      s.client.from('organization_industries').select('industry_id').eq('organization_id',s.org),
      s.repository.industries(),
    ]);
  if(!organization)throw new Error('Company workspace unavailable');
  const timeline=resultSchema.parse(activity);
  const history:LeadHistoryItem[]=timeline.rows.map((item)=>({
    id:String(item.id),
    type:String(item.activity_type||'system'),
    title:String(item.subject||item.activity_type||'Update'),
    body:String(item.body||''),
    at:String(item.occurred_at||''),
    system:item.system_generated===true,
  }));
  const latest=history.find((entry)=>!entry.system);
  const stages:LeadStage[]=choices.stages.rows.map((row)=>({
    id:String(row.id),name:String(row.name),
    outcome:row.outcome==='won'||row.outcome==='lost'?row.outcome:'open',
  }));
  const team:LeadOption[]=optionRows(choices.team);
  const reasons:LeadOption[]=optionRows(choices.reasons.rows);
  const state:Pick<LeadView,'id'|'version'|'stageId'|'stageName'|'assignedTo'|'nextFollowUpAt'|'lifecycle'>={
    id,version:l.version,stageId:l.stage_id,
    stageName:stages.find((x)=>x.id===l.stage_id)?.name||l.lifecycle,
    assignedTo:l.assigned_to||'',nextFollowUpAt:l.next_follow_up_at,lifecycle:l.lifecycle,
  };
  const enabled=new Set(memberships.error?[]:(memberships.data??[]).map((r)=>r.industry_id));
  const services=industries.filter((v)=>enabled.has(v.id)&&v.status==='active');
  const category=resolveLeadCategory(l,services);
  const serviceOptions=[...new Set(services.map(v=>leadServiceFromIndustryKey(v.key))
    .filter((v):v is 'construction'|'interior'=>v!==null))];
  const canManage=s.allowed('lead.manage');
  const canFollowUp=s.allowed('crm.followup.manage');
  const canNote=s.allowed('crm.activity.create');
  const canQuote=s.allowed('quotation.create','quotation');
  const canViewQuote=s.allowed('quotation.view','quotation');

  type LeadQuote={
    revisionId:string;number:string;status:string;amount:string|null;shared:boolean;
  };
  let quotes:LeadQuote[]=[];
  if(canViewQuote){
    const rpc=s.client.rpc.bind(s.client) as unknown as
      (name:string,args:Record<string,string>)=>Promise<{data:unknown;error:unknown}>;
    const response=await rpc('lead_quotation_list',{
      p_organization_id:s.org,p_lead_id:id,
    });
    if(!response.error&&Array.isArray(response.data)){
      quotes=response.data.flatMap((q:unknown)=>{
        if(!q||typeof q!=='object')return [];
        const x=q as Record<string,unknown>;
        if(typeof x.revision_id!=='string')return [];
        return [{
          revisionId:x.revision_id,
          number:typeof x.quotation_number==='string'?x.quotation_number:'Quotation',
          status:typeof x.status==='string'?x.status:'draft',
          amount:typeof x.amount==='string'?x.amount:null,
          shared:x.shared===true,
        }];
      }).filter((q)=>q.status!=='cancelled');
    }
  }
  const editing:Record<string,unknown>=Object.fromEntries(
    Object.keys(crmSchemas.leads.shape)
      .filter(k=>k in l&&!['assigned_to','stage_id'].includes(k))
      .map(k=>[k,l[k as keyof typeof l]]),
  );
  editing.budget_min=l.budget_min===null?null:String(l.budget_min);
  editing.budget_max=l.budget_max===null?null:String(l.budget_max);
  const requirementFields:Field[]=choices.requirements.rows
    .filter(r=>!r.industry_id||r.industry_id===l.industry_id)
    .map(r=>({
      key:'requirements.'+String(r.key),label:String(r.name),
      required:Boolean(r.required),
      type:r.field_type==='number'?'number':r.field_type==='boolean'?'checkbox':'text',
      ...(r.field_type==='select'?{options:[
        {value:'',label:'Not specified'},
        ...(Array.isArray(r.options)?r.options:[]).map(v=>({value:String(v),label:String(v)})),
      ]}:{}),
    }));
  const nav:OwnerNavItem[]=[
    {label:'Dashboard',href:'/dashboard',icon:'dashboard'},
    leadsNavigation({canCreate:s.allowed('lead.create'),canManage:s.allowed('crm.pipeline.manage')}),
    ...(canViewQuote?[{label:'Quotations',href:'/dashboard/quotations',icon:'quotations' as const}]:[]),
    ...(s.allowed('project.view','projects')?[{label:'Projects',href:'/dashboard/projects',icon:'projects' as const}]:[]),
    ...(s.allowed('customer.view','crm')||s.allowed('customer.view','quotation')?
      [{label:'Clients',href:'/dashboard/customers',icon:'clients' as const}]:[]),
  ];
  const display=(user.email??'').split('@')[0]||'Team';
  const call='tel:'+(l.phone_normalized||l.phone);
  const wa=(l.phone_normalized||l.phone).replace(/[^0-9]/g,'');
  return (
    <OwnerShell companyName={organization.name} accountLabel={display} accountEmail={user.email??''}
      planLabel={plans?.find(plan=>plan.id===organization.plan_id)?.name??'Business plan'}
      navigation={nav} search="" currentHref="/dashboard/crm/leads"
      notificationsEnabled={s.allowed('notification.view')}>
      <main id="main-content" className="crm-lead-detail-root crm-lead-history-page">
        <div className="crm-history-topline">
          <Link href="/dashboard/crm/leads">← Back to Leads</Link>
          <span>{l.lead_number}</span>
        </div>
        <section className="crm-history-profile">
          <div className="crm-history-profile-top">
            <span className="crm-history-avatar">{l.name.charAt(0).toUpperCase()}</span>
            <div className="crm-history-person">
              <h1>{l.name}</h1>
              <p>{l.lead_number} · {l.location||'Location not set'}</p>
              <div className="crm-history-badges">
                <span>{leadCategoryLabel(category)}</span>
                <span>{l.lifecycle.replaceAll('_',' ')}</span>
                <span>{leadRequirementLabel(l)||'Requirements pending'}</span>
              </div>
            </div>
            <div className="crm-history-contact-actions">
              <a className="primary" href={call}>Call</a>
              {wa&&<a href={'https://wa.me/'+wa} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
            </div>
          </div>
          <div className="crm-history-contact-summary">
            <span><strong>Phone</strong><a href={call}>{l.phone}</a></span>
            {l.email&&<span><strong>Email</strong><a href={'mailto:'+l.email}>{l.email}</a></span>}
            <span><strong>Service</strong>{leadCategoryLabel(category)}</span>
            <span><strong>Project</strong>{leadRequirementLabel(l)||'Not specified'}</span>
          </div>
          <div className="crm-history-inline-grid">
            <div><strong>Stage</strong><LeadStageSelect lead={state} stages={stages} lostReasons={reasons}
              canManage={canManage} canWin={s.allowed('lead.win')}/></div>
            <div><strong>Assigned to</strong><LeadAssigneeSelect lead={state} assignees={team}
              canAssign={s.allowed('lead.assign')}/></div>
            <div><strong>Next follow-up</strong><LeadFollowUpSetter lead={state} canFollowUp={canFollowUp}/></div>
          </div>
          <div className="crm-history-last-update">
            <span>Latest update</span>
            <strong>{latest?.title||'No conversation logged yet'}</strong>
            <p>{latest?.body||'Record a call or message below. It will appear here and on All Leads.'}</p>
          </div>
        </section>

        <div className="crm-history-main-grid">
          <div className="crm-history-main-left">
            <LeadActivityScheduler leadId={id} leadName={l.name}
              assignedTo={l.assigned_to||''} assignees={team}
              defaultLocation={l.location||''}
              canSchedule={canFollowUp&&l.lifecycle==='open'}/>
            {canNote&&l.lifecycle!=='archived'&&(
              <LeadUpdateComposer leadId={id} leadName={l.name} canFollowUp={canFollowUp} inline/>
            )}
            <section className="crm-history-quotes">
              <div className="crm-history-quotes-head">
                <h2>Quotations</h2>
                {canQuote&&l.lifecycle!=='archived'&&
                  <Link href={'/dashboard/quotations/new?lead='+id}>+ Prepare quotation</Link>}
              </div>
              {quotes.length?(
                <div className="crm-history-quote-grid">
                  {quotes.map(q=><LeadQuotePreview key={q.revisionId}
                    revisionId={q.revisionId} number={q.number} status={q.status}
                    amount={q.amount} shared={q.shared}/>)}
                </div>
              ):<p className="crm-history-empty">No active quotation linked to this lead.</p>}
            </section>
            {l.converted_project_id ? (
              <section className="crm-history-related">
                <strong>Converted client</strong>
                <Link href={'/dashboard/projects/'+l.converted_project_id}>Open project →</Link>
              </section>
            ):l.lifecycle==='won'&&s.allowed('lead.convert')?(
              <section className="crm-history-related">
                <strong>Lead marked Won</strong>
                <Link href={'/dashboard/crm/leads/'+id+'/convert'}>Convert to client →</Link>
              </section>
            ):null}
            {canManage&&l.lifecycle!=='archived'&&(
              <details className="crm-history-edit">
                <summary>Edit customer details</summary>
                <MasterForm title="Save customer details"
                  submitAction={saveCrm.bind(null,'leads')}
                  initial={editing}
                  fields={[
                    ...leadFields(choices,true).filter(f=>f.key!=='industry_id'&&f.key!=='service_type'),
                    ...requirementFields,
                  ]}/>
                {serviceOptions.length>1&&
                  <LeadCategoryEditor leadId={id} version={l.version}
                    currentCategory={category} categories={serviceOptions}/>}
              </details>
            )}
          </div>
          <div className="crm-history-main-right">
            <LeadHistoryTimeline items={history} timezone={organization.default_timezone||'Asia/Kolkata'}/>
            {timeline.total>25&&<Pagination path={'/dashboard/crm/leads/'+id}
              params={p} page={pageNumber(p.page)} total={timeline.total}/>}
          </div>
        </div>
      </main>
    </OwnerShell>
  );
}
