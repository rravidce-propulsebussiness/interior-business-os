import Link from 'next/link';
import Image from 'next/image';
import { OwnerIcon, type OwnerIconName, OwnerShell } from '../owner-shell';
import { ownerWorkspaceNavigation } from '../owner-workspace-navigation';
import { OwnerMobileNav } from '../owner-mobile-nav';
import { OwnerProjectRequests } from '../../project-request-widgets';
import { canAccess } from '@business-os/auth';
import { guidanceForConstructionStage } from '@business-os/core/construction-payment-schedule';
import { ProjectStageLinker,type StageLinkOption } from './project-stage-linker';
import { suggestedStageMaterials } from './stage-material-options';
import { MaterialMarketplaceOrder } from './project-material-marketplace-order';
import { MaterialOrderingAccess,MaterialDeliveryActions } from './project-material-delivery';
import { StageChecklistItem } from './project-stage-checklist-item';
import { StageActivationControl } from './project-stage-activation';
import { ProjectClientAccess } from './project-client-access';
import { ProjectSiteSurvey,ProjectAdvanceAction } from './project-next-forms';
import { effectiveProjectStageStatus } from './project-stage-status';
import { MasterForm } from '../commercial/master-form';
import { activeOrganization } from '@business-os/auth/server';
import { projectWorkspace,formatMoney,pretty,shortDate,stringValue,
 type WorkspaceData,type SiteRow } from './project-v2-data';
import {
 SiteReportForm,SiteMediaForm,MaterialRequestForm,MaterialUpdateForm,
 QualityForm,ReviewCheck,GateForm,AssignRole,SyncStages,
 ProjectLifecycle,PrepareAgreement,SignedAgreementUploadForm,ProjectContractActivation,
} from './project-v2-forms';
import '../owner-dashboard.css';
import './project-v2.css';

export const projectPages=[
 {slug:'overview',title:'Overview',icon:'dashboard' as OwnerIconName},
 {slug:'timeline',title:'Timeline',icon:'calendar' as OwnerIconName},
 {slug:'documents',title:'Quote & Agreement',icon:'quotations' as OwnerIconName},
 {slug:'payments',title:'Payments',icon:'billing' as OwnerIconName},
 {slug:'procurement',title:'Procurement',icon:'purchases' as OwnerIconName},
 {slug:'labour',title:'Labour',icon:'team' as OwnerIconName},
 {slug:'execution',title:'Execution',icon:'projects' as OwnerIconName},
 {slug:'checks',title:'Checks',icon:'check' as OwnerIconName},
 {slug:'designs',title:'Designs & Plans',icon:'quotations' as OwnerIconName},
 {slug:'team',title:'Team & Access',icon:'team' as OwnerIconName},
] as const;
export type ProjectPageSlug=(typeof projectPages)[number]['slug'];
const cur=(id:string,view:string)=>'/dashboard/projects/'+id+(view==='overview'?'':'/'+view);
function Status({value}:{value:string}) {
 return <span className={'pv2-status '+(['active','ongoing','paid','passed','approved','received','completed','signed'].includes(value)
  ?'good':['pending','in_progress','requested','submitted','ordered'].includes(value)?'warn':'neutral')}>
  {pretty(value)||'Not recorded'}</span>;
}
function Title({title,detail,action}:{title:string;detail:string;action?:React.ReactNode}){
 return <header className="pv2-section-header"><div><h2>{title}</h2><p>{detail}</p></div>{action}</header>;
}
function Blank({title,detail,action}:{title:string;detail:string;action?:React.ReactNode}){
 return <div className="pv2-blank"><OwnerIcon name="projects" size={28}/>
  <h3>{title}</h3><p>{detail}</p>{action}</div>;
}
function DataTable({head,children}:{head:string[];children:React.ReactNode}){
 return <div className="pv2-table-scroll"><table className="pv2-table"><thead><tr>
  {head.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}
function NextLink({href,label}:{href:string;label:string}){
 return <Link className="pv2-action-link" href={href}>{label} <OwnerIcon name="arrow" size={14}/></Link>;
}
function PhotoStrip({projectId,rows}:{projectId:string;rows:SiteRow[]}){
 const media=rows.filter(row=>stringValue(row.mime).startsWith('image/')).slice(0,4);
 if(!media.length)return null;
 return <div className="pv2-photo-strip">{media.map(m=><a key={m.id}
  href={'/dashboard/projects/'+projectId+'/site/media/'+m.id} target="_blank" rel="noopener noreferrer"
  aria-label={stringValue(m.caption)||'View photo'}>
  <Image unoptimized src={'/dashboard/projects/'+projectId+'/site/media/'+m.id}
   width={152} height={92} alt={stringValue(m.caption)||'Project site photo'}/></a>)}</div>;
}
function FieldDate({value}:{value:unknown}){return <time>{shortDate(value)}</time>;}
function LinkTabs({data,active}:{data:WorkspaceData;active:ProjectPageSlug}){
 return <nav className="pv2-project-tabs" aria-label="Project workspace pages">
  {projectPages.filter(p=>p.slug!=='timeline'&&(p.slug!=='payments'||data.permissions.payments)).map(p=>
   <Link key={p.slug} href={cur(data.project.id,p.slug)}
    aria-current={active===p.slug?'page':undefined} className={active===p.slug?'selected':''}>
    <OwnerIcon name={p.icon} size={16}/>{p.slug==='documents'&&!data.permissions.quotation&&!data.permissions.finance?'Documents':p.title}</Link>)}
 </nav>;
}
function ProjectHeader({data,active}:{data:WorkspaceData;active:ProjectPageSlug}){
 const p=data.project;
 return <div className="pv2-project-header">
  <div className="pv2-project-identity">
   <div className="pv2-project-thumb"><OwnerIcon name="projects" size={27}/></div>
   <div><h1>{p.name}</h1><div className="pv2-project-meta">
    <span><OwnerIcon name="quotations" size={13}/>{p.code||'Project'}</span>
    <span><OwnerIcon name="projects" size={13}/>{p.industry}</span>
    <span><OwnerIcon name="globe" size={13}/>{p.address}</span>
   </div></div><Status value={p.status}/>
  </div>
  {p.progress!==null&&<div className="pv2-header-progress">
   <span>Overall progress <strong>{p.progress}%</strong></span>
   <div className="pv2-bar"><span style={{width:p.progress+'%'}}/></div>
  </div>}
  <div className="pv2-project-header-actions">
   {data.permissions.manage&&data.projectRaw&&<details className="pv2-header-drawer">
    <summary className="pv2-button pv2-outline">✎ Edit project</summary>
    <div className="pv2-header-drawer-body">
     <MasterForm entity="projects" title="Save project" initial={data.projectRaw}
      fields={[
       {key:'name',label:'Project name',required:true},
       {key:'site_address.line1',label:'Site address'},
       {key:'site_address.city',label:'City'},
       {key:'site_address.region',label:'State'},
       {key:'notes',label:'Internal notes',type:'textarea' as const},
      ]}/>
    </div>
   </details>}
   {p.customerId&&<details className="pv2-header-drawer">
    <summary className="pv2-button pv2-outline">Share with client</summary>
    <div className="pv2-header-drawer-body">
     <ProjectClientAccess projectId={p.id} customerId={p.customerId}/>
    </div>
   </details>}
  </div>
  <LinkTabs data={data} active={active}/>
 </div>;
}
/** One actionable project surface. Detail modules keep the original records,
 * while project stages and inline forms give the owner a single place to work. */
function ProjectFinancialSummary({d}:{d:WorkspaceData}){
 const received=d.transactions===null?null:d.transactions.filter(x=>x.status==='recorded')
  .reduce((sum,x)=>sum+x.amount,0);
 const balance=received===null||d.expenditure===null?null:received-d.expenditure;
 const cards=[
  {title:'Project Total Cost',amount:d.contractValue,detail:'Agreed contract value',tone:'orange',icon:'billing' as OwnerIconName},
  {title:'Payment Received',amount:received,detail:'Recorded client receipts',tone:'green',icon:'billing' as OwnerIconName},
  {title:'Expenses',amount:d.expenditure,detail:d.expenditure===null?'Project expense ledger unavailable':'Actual recorded project costs',tone:'red',icon:'expenses' as OwnerIconName},
  {title:'Balance from Received',amount:balance,detail:'Received minus actual expenses',tone:'purple',icon:'billing' as OwnerIconName},
 ];
 return <section className="pv2-financial-cards" aria-label="Project financial summary">
  {cards.map(card=><article className={'pv2-financial-card pv2-money-'+card.tone} key={card.title}>
    <span className="pv2-money-icon"><OwnerIcon name={card.icon} size={23}/></span>
    <div><span className="pv2-money-title">{card.title}</span>
     <strong>{formatMoney(card.amount)}</strong><small>{card.detail}</small></div>
   </article>)}
 </section>;
}
/** Stage-specific forms share the canonical records used by the document and
 * finance archives. There is no second agreement or design workflow above
 * this quotation-derived timeline. */
function ProjectStageWorkflow({d,code}:{d:WorkspaceData;code:string}){
 const hasPrecon=d.stages.some(x=>x.template_code==='PRECONSTRUCTION');
 const agreementStep=code==='PRECONSTRUCTION'||(code==='SITE_SURVEY'&&!hasPrecon);
 const surveyStep=code==='PRECONSTRUCTION'||code==='SITE_SURVEY';
 const designStep=code==='DESIGN'||code==='DESIGN_APPROVAL';
 if(!agreementStep&&!surveyStep&&!designStep)return null;
 const signed=d.agreement?.clearanceType==='signed_copy_recorded'||d.preflight?.signedReady===true;
 const quote=d.quotations[0];
 // The signed contract is the agreed scope; later quote alternatives are history.
 const sameRevision=signed||!d.agreement?.revisionId||!quote||d.agreement.revisionId===quote.revisionId;
 const inspection=d.preflight?.inspectionDone===true;
 const measured=d.preflight?.measurementsDone===true;
 const canSurvey=d.permissions.manage||['manager','site_engineer'].includes(d.site?.role??'');
 const pdfs=(d.site?.media??[]).filter(x=>x.category==='agreement'&&x.mime==='application/pdf');
 const invoice=d.advance;
 const due=invoice?.invoiceId?Math.max(0,invoice.invoiceTotal-invoice.received):null;
 const paid=Boolean(invoice?.invoiceId&&invoice.invoiceTotal>0&&due===0);
 const defaultPercent=d.quotePaymentTriggers.find(x=>/advance|booking/i.test(x.name))?.percent??10;
 // The database is authoritative for clearance; guide the user to just one
 // required finance action at a time, rather than sending them backward.
 const contractHref=cur(d.project.id,'documents')+'#project-agreement';
 const readinessStep=!d.agreement
  ?{title:'Prepare the contract',detail:'A contract is required before work can start.',
    href:cur(d.project.id,'documents'),action:'Review quotation & agreement'}
  :!sameRevision
  ?{title:'Confirm unsigned agreement scope',detail:'The draft agreement refers to a different quotation. Confirm the agreed version before signing.',
    href:contractHref,action:'Open project agreement'}
  :!signed
  ?{title:'Confirm signed agreement',detail:'Record the currently signed agreement before starting construction.',
    href:cur(d.project.id,'timeline'),action:'Review signing'}
  :d.agreement.status!=='active'
  ?{title:'Activate the contract',detail:'Signed agreement recorded. Activate its existing contract before physical construction.',
    href:contractHref,action:'Activate signed contract'}
  :!d.advance?.scheduleActive
  ?d.quotePaymentTriggers.length>0
    ?{title:'Sync agreed payment milestones',detail:'The stage-wise payment plan is already saved in the signed quotation. It is imported automatically; refresh the project to confirm its activation.',
      href:cur(d.project.id,'payments'),action:'View agreed payment milestones'}
    :{title:'Confirm contract payment terms',detail:'No valid stage-wise payment plan was found in the signed quotation. Confirm the agreed terms before physical work.',
      href:contractHref,action:'View agreement terms'}
  :!d.advance?.received
  ?{title:'Record advance actually received',detail:'The advance invoice is issued, but no payment has been verified. Record a receipt only after receiving funds.',
    href:'/dashboard/finance?tab=payments&contract_id='+d.agreement.contractId,
    action:'Open Finance payments'}
  :!d.agreement.authorized
  ?{title:'Confirm site-start clearance',detail:'Verify current signed evidence and required payment records before physical construction.',
    href:contractHref,action:'View project agreement'}
  :null;
 return <div className="pv2-stage-workflow">
  {agreementStep&&<>
   <h3>Agreement & advance</h3>
   {!d.agreement?<>
    <p className="pv2-muted">The project exists from its approved quotation. Prepare its agreement here; do not create another project.</p>
    {quote?.status==='issued'&&d.permissions.manage&&d.permissions.finance&&
     <PrepareAgreement projectId={d.project.id} revisionId={quote.revisionId}/>}
    {(!quote||quote.status!=='issued')&&<p className="pv2-muted">Issue the final quotation before preparing the agreement.</p>}
   </>:<>
    <div className="pv2-stage-workflow-status"><strong>{d.agreement.contractNumber}</strong>
     <Status value={signed?'signed':d.agreement.status||'pending'}/></div>
    {d.permissions.finance&&<NextLink href={contractHref} label="View agreement record"/>}
    {signed&&d.agreement.status==='pending'&&d.permissions.contractManage&&typeof d.agreement.version==='number'&&
     <ProjectContractActivation contractId={d.agreement.contractId} version={d.agreement.version}/>}

    {!sameRevision&&<p role="alert" className="pv2-form-feedback bad">This agreement belongs to an earlier Final quotation. Check the linked revision before proceeding.</p>}
    {!signed&&sameRevision&&d.site?.canManage&&d.permissions.finance&&
     <details className="pv2-edit-drawer"><summary>Upload or record signed agreement</summary>
      <SignedAgreementUploadForm projectId={d.project.id} contractId={d.agreement.contractId}
       media={pdfs.map(x=>({id:x.id,name:stringValue(x.filename)}))}/>
     </details>}
    {signed&&<p className="pv2-form-feedback good">Signed agreement recorded. No repeat approval or upload is required.</p>}
    {signed&&invoice!==null&&<div className="pv2-stage-workflow-payment">
     <strong>Advance payment — required before site execution</strong>
     <p>{invoice.invoiceId?formatMoney(invoice.received)+' received · '+formatMoney(due)+' pending':'Advance invoice not yet requested'}</p>
     <Status value={paid?'paid':invoice.invoiceStatus||'pending'}/>
     {!invoice.invoiceId&&d.permissions.finance&&d.permissions.manage&&
      <details className="pv2-edit-drawer"><summary>Issue advance proforma</summary>
       <ProjectAdvanceAction projectId={d.project.id} defaultPercent={defaultPercent}/>
      </details>}
     {invoice.invoiceId&&d.permissions.finance&&<NextLink href={'/dashboard/finance?tab=invoices'+(invoice.invoiceNumber?'&q='+encodeURIComponent(invoice.invoiceNumber):'')} label="View advance in Finance"/>}
     {!invoice.scheduleActive&&<p className="pv2-hint">Payment stages come from the signed quotation; no second payment schedule should be entered. A verified advance is required before physical construction.</p>}
     {invoice.scheduleActive&&<p className="pv2-hint">Agreed quotation milestones are active. Payments remain unpaid until actual receipts are recorded.</p>}
    </div>}
   </>}
   {d.site?.stage==='not_started'&&signed&&sameRevision&&d.site.canManage&&
    <ProjectLifecycle id={d.project.id} stage="not_started" canManage
     agreementSigned={signed} industry={d.project.industry} designs={[]}/>}
  </>}
  {surveyStep&&signed&&<div className="pv2-stage-workflow-survey">
   <h3>Site inspection & measurements</h3>
   <div className="pv2-checklist-inline">
    <span className={inspection?'done':'waiting'}>{inspection?'✓':'○'} Site inspection</span>
    <span className={measured?'done':'waiting'}>{measured?'✓':'○'} Measurements</span>
   </div>
   {!inspection&&canSurvey&&<details className="pv2-edit-drawer"><summary>Record site inspection</summary>
    <ProjectSiteSurvey projectId={d.project.id} kind="inspection" previous={d.preflight?.inspectionDetails}/>
   </details>}
   {inspection&&!measured&&canSurvey&&<details className="pv2-edit-drawer"><summary>Record site measurements</summary>
    <ProjectSiteSurvey projectId={d.project.id} kind="measurements" previous={d.preflight?.measurementDetails}/>
   </details>}
  </div>}
  {designStep&&d.site?.stage==='client_approved'&&<div className="pv2-execution-readiness" aria-label="Site execution requirements">
   <h3>Construction start readiness</h3>
   <div className="pv2-execution-readiness-grid">
    <span>Active contract <strong>{d.agreement?.status==='active'?'Ready':d.agreement?'Pending activation':'Not available'}</strong></span>
    <span>Signed agreement <strong>{signed?'Recorded':'Not confirmed'}</strong></span>
    <span>Payment schedule <strong>{d.advance===null?'Unavailable':d.advance.scheduleActive?'Active':'Not active'}</strong></span>
    <span>Verified advance <strong>{d.advance===null?'Unavailable':formatMoney(d.advance.received)}</strong></span>
   </div>
   {d.agreement?.authorized?
    <p className="pv2-hint">Commercial and agreement clearance confirmed. Review site readiness and start execution below.</p>:
    <div className="pv2-readiness-next" role="status">
     <strong>Next action: {readinessStep?.title??'Confirm execution clearance'}</strong>
     <p>{readinessStep?.detail??'Confirm the project financial records before physical site work.'}</p>
     {readinessStep?.title==='Activate the contract'&&d.agreement&&signed&&
       d.permissions.contractManage&&typeof d.agreement.version==='number'?
      <ProjectContractActivation contractId={d.agreement.contractId} version={d.agreement.version}/>:
      readinessStep&&d.permissions.finance?
      <NextLink href={readinessStep.href} label={readinessStep.action}/>:
      <p className="pv2-hint">Ask a company owner or finance manager to complete this step.</p>}
    </div>}
  </div>}
  {designStep&&d.site&&['design','client_approved'].includes(d.site.stage)&&
   <ProjectLifecycle id={d.project.id} stage={d.site.stage} canManage={d.site.canManage}
    agreementSigned={signed} industry={d.project.industry}
    executionReady={d.agreement?.authorized===true}
    designs={d.site.designs.map(x=>({id:x.id,kind:stringValue(x.kind),status:stringValue(x.status)}))}/>}
 </div>;
}
function ProjectStageBoard({d}:{d:WorkspaceData}){
 const site=d.site;
 const done=(status:string)=>['completed','certified','done','skipped'].includes(status);
 const evidence={
  approvedQuotation:d.quotations.some(q=>['issued','approved','accepted'].includes(q.status))||
   Boolean(d.agreement?.revisionId),
  quotedScopeImported:d.stages.some(stage=>stage.template_code==='QUOTED_SCOPE'),
  agreementPrepared:Boolean(d.agreement),
  agreementSigned:d.agreement?.clearanceType==='signed_copy_recorded'||d.preflight?.signedReady===true,
  inspectionDone:d.preflight?.inspectionDone===true,
  measurementsDone:d.preflight?.measurementsDone===true,
  designRevisionStarted:Boolean(d.site?.designs.length),
  designClientApproved:['client_approved','execution'].includes(d.site?.stage??''),
 };
 const executionById=new Map(d.stageExecution.map(item=>[item.stageId,item]));
 const visualStatuses=d.stages.map(stage=>{
  const effective=effectiveProjectStageStatus(stage,evidence);
  const recorded=executionById.get(stage.id);
  return recorded?.status==='certified'?'certified':
   recorded&&recorded.status!=='not_started'?recorded.status:effective;
 });
 const activeStages=d.stageExecution.filter(stage=>stage.status==='in_progress').length;
 const active=visualStatuses.findIndex(status=>!done(status));
 const designIndex=d.stages.findIndex(stage=>['DESIGN','DESIGN_APPROVAL'].includes(stage.template_code));
 // The active client-approved design stage contains the final execution gate.
 // Keep that action visible in the timeline instead of hiding it behind
 // an older preconstruction stage whose financial details remain accessible.
 const current=['design','client_approved'].includes(d.site?.stage??'')&&designIndex>=0?designIndex:
  active<0?d.stages.length-1:active;
 const allowWork=site?.stage==='execution'&&
  (site.canManage||['manager','project_manager','site_engineer','supervisor'].includes(site.role));
 const allowMaterials=site?.stage==='execution'&&
  (site.canManage||['manager','project_manager','procurement','site_engineer'].includes(site.role));
 const allowChecks=site?.stage==='execution'&&
  (site.canManage||['manager','project_manager','quality_inspector','site_engineer'].includes(site.role));
 return <section className="pv2-panel pv2-command-stages" id="project-timeline">
  <div className="pv2-command-head">
   <div><h2>Project timeline</h2>
    <p>Manage stages, work, payments, materials, labour, photos and checks in one place.</p></div>
   <span className="pv2-timeline-counter">{activeStages} active · {d.stages.length} stages</span>
  </div>
  {!d.stages.length?<div className="pv2-stage-empty">
    <p>Stages are created from the signed agreement and its approved quotation; no generic stages are inserted.</p>
    {d.site?.canManage&&d.agreement&&<SyncStages id={d.project.id}/>}
    {!d.agreement&&d.quotations[0]?.status==='issued'&&d.permissions.manage&&d.permissions.finance&&
    <PrepareAgreement projectId={d.project.id} revisionId={d.quotations[0].revisionId}/>}
   {!d.agreement&&<p>Prepare the agreement from the issued Final quotation before importing stages.</p>}
   </div>:<div className="pv2-command-stage-list">
    {d.stages.map((stage,index)=>{
      const visualStatus=visualStatuses[index]??stage.status;
      const stageExecution=executionById.get(stage.id);
      const physicalStage=!['QUOTED_SCOPE','PRECONSTRUCTION','DESIGN','DESIGN_APPROVAL','SITE_SURVEY'].includes(stage.template_code);
      const workAllowed=allowWork&&stageExecution?.status==='in_progress';
      const checksAllowed=allowChecks&&stageExecution?.status==='in_progress';
      const complete=done(visualStatus);
      const guidance=guidanceForConstructionStage(stage.template_code);
      const customGuidance=d.stageGuidance.find(x=>x.stageId===stage.id);
      const plannedMaterials=customGuidance?.materials??guidance.materials;
      const plannedReports=customGuidance?.reports??guidance.reports;
      const checks=customGuidance?stage.inspectionTopics:
       [...new Set([...stage.inspectionTopics,...guidance.checks])];
      const payment=d.quotePaymentTriggers.filter(p=>p.stageCodes.includes(stage.instance_code));
      const linked=d.links.filter(x=>x.stage_id===stage.id);
      const stageMaterials=(site?.materials??[]).filter(m=>linked.some(l=>
       l.kind==='material'&&l.record_id===m.id));
      const suggestedMaterials=[...new Set([...suggestedStageMaterials(stage.template_code),...plannedMaterials])];
      const stageWork=d.stageProgress.work.filter(x=>stringValue(x.stage_id)===stage.id);
      const stageChecks=d.stageProgress.checks.filter(x=>stringValue(x.stage_id)===stage.id);
      const passed=checks.filter(title=>[...stageChecks,...(site?.checks??[])].some(x=>
       stringValue(x.title).toLowerCase()===title.toLowerCase()&&stringValue(x.status)==='passed')).length;
      const finishedActivities=stage.activities.filter((_,i)=>stageWork.some(x=>
       Number(x.index)===i&&stringValue(x.status)==='completed')).length;
      const formalQc=d.stageProgress.qualityStages.find(x=>stringValue(x.stage_id)===stage.id);
      const formalInspections=Array.isArray(formalQc?.inspections)?formalQc.inspections as Record<string,unknown>[]:[];
      const formalReviews=Array.isArray(formalQc?.reviews)?formalQc.reviews as Record<string,unknown>[]:[];
      const displayStatus=visualStatus==='not_started'&&finishedActivities>0?
        'work_recorded':visualStatus;
      const photos=(site?.media??[]).filter(x=>stringValue(x.mime).startsWith('image/'))
       .map(x=>({id:x.id,filename:stringValue(x.filename)}));
      const availableRecords:StageLinkOption[]=[
       ...(site?.reports??[]).map(x=>({kind:'report' as const,id:x.id,title:shortDate(x.report_date)+' — '+stringValue(x.completed_work)})),
       ...(site?.materials??[]).map(x=>({kind:'material' as const,id:x.id,title:stringValue(x.item)})),
       ...(site?.checks??[]).map(x=>({kind:'check' as const,id:x.id,title:stringValue(x.title)})),
       ...(site?.media??[]).filter(x=>x.category!=='agreement').map(x=>({kind:'media' as const,id:x.id,title:stringValue(x.filename)})),
      ];
      return <details className={'pv2-command-stage '+(complete?'is-complete':'')+
       (index===current?' is-current':'')} key={stage.id} open={index===current}>
       <summary className="pv2-command-stage-summary">
        <span className="pv2-stage-number">{complete?'✓':index+1}</span>
        <span className="pv2-stage-title-block"><strong>{stage.title}</strong>
         <small>{stage.floor_code?pretty(stage.floor_code)+' · ':''}{stage.phase?pretty(stage.phase)+' · ':''}{stage.activities.length} work items</small></span>
        <Status value={displayStatus}/>
        <span className="pv2-stage-meta">{payment.length} payment milestone{payment.length===1?'':'s'}</span>
        <OwnerIcon name="arrow" size={15}/>
       </summary>
       <div className="pv2-command-stage-inner">
        {stage.explanation&&<p className="pv2-muted">{stage.explanation}</p>}
        {!!stage.dependencies.length&&<p className="pv2-stage-hint">Dependent on: {stage.dependencies.join(' · ')}</p>}
        {(!complete||(['DESIGN','DESIGN_APPROVAL'].includes(stage.template_code)&&site?.stage==='client_approved'))&&
         <ProjectStageWorkflow d={d} code={stage.template_code}/>}

        {physicalStage&&site?.stage==='execution'&&<StageActivationControl
         projectId={d.project.id} stageId={stage.id} state={stageExecution}
         canManage={allowWork}/>}
        {!!stage.activities.length&&<div className="pv2-stage-task-group">
         <h4>Work checklist <small>{finishedActivities}/{stage.activities.length} completed</small></h4>
         <p className="pv2-hint">Mark each activity separately as work progresses. This does not certify or close the whole stage.</p>
         <div className="pv2-stage-task-entries">
          {stage.activities.map((work,i)=>{
           const record=stageWork.find(x=>Number(x.index)===i);
           return <StageChecklistItem key={i} projectId={d.project.id} stageId={stage.id}
             kind="work" index={i} title={work} status={stringValue(record?.status)||'pending'}
             notes={stringValue(record?.notes)} photoId={stringValue(record?.photo_id)}
             photos={photos} canEdit={workAllowed&&!complete}/>;
          })}
         </div>
        </div>}
        {payment.length>0&&d.permissions.finance&&<div className="pv2-command-payments">
         <OwnerIcon name="billing" size={17}/><div><strong>Linked quotation payments</strong>
          <p>{payment.map(p=>p.name+' ('+p.percent+'%)').join(' · ')}</p>
          <small>After linked stages pass QC, one agreed payment request is issued. Payment is only recorded in Finance.</small></div>
         </div>}
        {!!checks.length&&<div className="pv2-stage-task-group">
         <h4>Checks & tests <small>{passed}/{checks.length} passed</small></h4>
         <p className="pv2-hint">Complete checks one by one, with photo evidence. A passed checklist item does not replace formal independent QC approval.</p>
         <div className="pv2-stage-task-entries">
          {checks.map((name,i)=>{
           const existing=stageChecks.find(x=>stringValue(x.title).toLowerCase()===name.toLowerCase())??
             (site?.checks??[]).find(x=>stringValue(x.title).toLowerCase()===name.toLowerCase());
           return <StageChecklistItem key={name} projectId={d.project.id} stageId={stage.id}
             kind="check" index={i} title={name} status={stringValue(existing?.status)||'pending'}
             notes={stringValue(existing?.notes)} photoId={stringValue(existing?.photo_id)}
             photos={photos} canEdit={checksAllowed&&!complete}/>;
          })}
         </div>
        </div>}
        {(formalInspections.length>0||formalReviews.length>0)&&<details className="pv2-stage-secondary pv2-formal-quality">
         <summary>Recorded QC inspections & approvals ({formalInspections.length} inspections)</summary>
         <p className="pv2-hint">Official inspection results and structural / quality approvals already recorded for this stage.</p>
         {formalInspections.map((record,i)=><div className="pv2-qc-history-row" key={stringValue(record.id)||i}>
          <strong>Inspection {stringValue(record.number)||String(i+1)}</strong>
          <Status value={stringValue(record.status)}/>
          {record.current===true&&<span className="pv2-label">Current</span>}
         </div>)}
         {formalReviews.map((record,i)=><div className="pv2-qc-history-row" key={stringValue(record.id)||i}>
          <strong>{pretty(record.review_kind)} review</strong>
          <Status value={stringValue(record.decision)}/>
          <small>{shortDate(record.reviewed_at)}</small>
          {!!stringValue(record.notes)&&<p className="pv2-hint">{stringValue(record.notes)}</p>}
         </div>)}
        </details>}
        {!!plannedReports.length&&<details className="pv2-stage-secondary">
          <summary>Evidence & reports to collect ({plannedReports.length})</summary>
          <ul>{plannedReports.map((report,i)=><li key={i}>{report}</li>)}</ul>
          <p className="pv2-hint">Upload evidence against this project stage. Listed reports are requirements, not automatically approved documents.</p>
         </details>}
        {(!!plannedMaterials.length||allowMaterials||!!stageMaterials.length)&&
         <details className="pv2-stage-secondary pv2-stage-material-plan">
          <summary>Materials to plan & request ({stageMaterials.length} recorded)</summary>
          {!!plannedMaterials.length&&<>
           <p className="pv2-hint">Planned materials from the accepted quotation and approved site specification. Enter actual quantities when requesting.</p>
           <ul>{plannedMaterials.map((name,i)=><li key={i}>{name}</li>)}</ul>
          </>}
          {!!stageMaterials.length&&<div className="pv2-stage-material-requests">
           <strong>Stage material requests</strong>
           {stageMaterials.map(m=>{
            const source=stringValue(m.source),status=stringValue(m.status);
            return <article key={m.id} className="pv2-stage-material-row">
             <div><b>{stringValue(m.item)}</b>
              <small>{stringValue(m.quantity)} {stringValue(m.unit)}</small></div>
             <Status value={status}/>
             {(site?.canManage||['manager','procurement'].includes(site?.role??''))&&
               (!((source==='marketplace') &&
                   stringValue(m.vendor_reference).startsWith('Marketplace request ') &&
                   !stringValue(m.vendor_reference).startsWith('Marketplace request rejected ') &&
                   status==='approved'))&&
               ['requested','approved','ordered'].includes(status)&&
               <MaterialUpdateForm id={d.project.id} material={{
                id:m.id,status,source,vendorReference:stringValue(m.vendor_reference),
               }}/>}

             <MaterialDeliveryActions projectId={d.project.id} material={{
              id:m.id,status,source,reference:stringValue(m.vendor_reference),
              date:stringValue(m.expected_delivery_date)||null,
              window:stringValue(m.expected_delivery_window)||null,
             }} canOrder={d.materialAccess.canOrder}
                canReceive={site?.canManage===true||['site_engineer','manager','procurement'].includes(site?.role??'')}/>
             {(status==='ordered'||status==='received')&&
              <p className="pv2-hint pv2-material-eta">
                {status==='received'?'Received at site':
                 stringValue(m.expected_delivery_date)?
                  'Expected '+shortDate(m.expected_delivery_date)+
                  (stringValue(m.expected_delivery_window)?' · '+stringValue(m.expected_delivery_window):''):
                  'Ordered · delivery date not yet set'}
              </p>}
             {d.permissions.purchaseManage&&d.materialAccess.canOrder&&<MaterialMarketplaceOrder
              projectId={d.project.id} material={{
               id:m.id,item:stringValue(m.item),quantity:Number(m.quantity),
               unit:stringValue(m.unit),status,source,
               vendorReference:stringValue(m.vendor_reference),
              }} offers={d.marketplaceOffers}/>}
             {['approved','requested','ordered','received'].includes(status)&&
              <p className="pv2-hint">{
               status==='requested'?'Awaiting owner/procurement approval':
               status==='approved'?'Approved for sourcing':
               status==='ordered'?'Supplier order placed; delivery must still be verified':
               'Marked received by site staff'
              }</p>}
            </article>;
           })}
          </div>}
          {allowMaterials&&<details className="pv2-stage-material-entry">
           <summary>+ Add materials needed for this stage</summary>
           <MaterialRequestForm id={d.project.id} stageId={stage.id}
            suggestions={suggestedMaterials}/>
          </details>}
          {d.permissions.purchaseManage&&d.marketplaceOffers.length===0&&
           <p className="pv2-stage-marketplace-empty">
            No approved sellers have published products in the marketplace yet.
            You can still plan and approve material quantities for this stage,
            or source approved requests from a local supplier.
           </p>}
          <p className="pv2-hint">Stage needs → internal approval → marketplace seller request or outside supplier → delivery verification. Requesting does not automatically place an order.</p>
         </details>}
        <div className="pv2-stage-attachment-count">{linked.length} linked site record{linked.length===1?'':'s'} · Linked evidence is not an approval.</div>
        <div className="pv2-command-stage-actions">
         {allowWork&&<details><summary><OwnerIcon name="projects" size={16}/> Update work</summary><SiteReportForm id={d.project.id}/></details>}
         {site?.stage==='execution'&&<details><summary><OwnerIcon name="projects" size={16}/> Upload photos</summary><SiteMediaForm id={d.project.id}/></details>}


         {site?.canManage&&!!site.memberOptions.length&&<details><summary><OwnerIcon name="team" size={16}/> Assign team</summary><AssignRole projectId={d.project.id} users={site.memberOptions}/></details>}

        </div>

        {site?.canManage&&availableRecords.length>0&&<details className="pv2-stage-secondary"><summary>Attach existing site evidence</summary>
         <ProjectStageLinker projectId={d.project.id} stageId={stage.id} options={availableRecords}/></details>}
       </div>
      </details>;
    })}
   </div>}
 </section>;
}
function ProjectCommandSidebar({d,showHistory=false}:{d:WorkspaceData;showHistory?:boolean}){
 const recent=timeline(d).slice(0,5);
 const signed=d.agreement?.clearanceType==='signed_copy_recorded'||d.preflight?.signedReady===true;
 const needsAdvance=signed&&d.advance!==null&&(!d.advance?.invoiceId||
    (d.advance.invoiceTotal>0&&d.advance.received<d.advance.invoiceTotal));
 const incompleteChecks=d.site?.checks.filter(r=>!['passed','approved'].includes(stringValue(r.status)))??[];
 const openRequests=(d.requests??[]).filter(request=>!['resolved','declined'].includes(request.status));
 return <aside className="pv2-command-sidebar">
  <section className="pv2-panel pv2-attention">
   <div className="pv2-command-head"><h2>Needs your attention</h2><span className="pv2-timeline-counter">
     {(needsAdvance?1:0)+incompleteChecks.length+(d.preflight&&!d.preflight.inspectionDone?1:0)+openRequests.length} pending</span></div>
   {needsAdvance&&<div className="pv2-attention-item">
     <span className="pv2-attention-symbol"><OwnerIcon name="billing" size={20}/></span>
     <div><strong>Advance payment pending</strong><p>{d.advance?.invoiceId?'Record a verified client receipt before treating the advance as paid.':'Issue the advance invoice from the next action below.'}</p></div>
    </div>}
   {incompleteChecks.slice(0,2).map(ch=><div className="pv2-attention-item" key={ch.id}>
    <span className="pv2-attention-symbol"><OwnerIcon name="check" size={20}/></span>
    <div><strong>{stringValue(ch.title)||'Quality check'}</strong><p>{pretty(ch.status)||'Pending review'}</p></div>
   </div>)}
   {d.preflight&&!d.preflight.inspectionDone&&<div className="pv2-attention-item">
    <span className="pv2-attention-symbol"><OwnerIcon name="calendar" size={20}/></span>
    <div><strong>Site inspection needed</strong><p>Record the survey and measurements before floor planning.</p></div></div>}
   {!needsAdvance&&!incompleteChecks.length&&!openRequests.length&&(!d.preflight||d.preflight.inspectionDone)&&
    <p className="pv2-muted">No outstanding project alerts from the available records.</p>}
   {d.permissions.manage&&<div className="pv2-owner-requests">
      <h3>Client questions & requests</h3>
      <OwnerProjectRequests projectId={d.project.id} requests={d.requests??[]}/>
    </div>}
   
  </section>
  <section className="pv2-panel">
   <div className="pv2-command-head"><h2>{showHistory?'Project activity':'Recent updates'}</h2>
     <span className="pv2-timeline-counter">{recent.length} updates</span></div>
   {recent.length?recent.map(entry=><div className="pv2-activity-row" key={entry.kind+entry.id}>
    <span className="pv2-activity-icon"><OwnerIcon name={entry.kind==='check'?'check':entry.kind==='material'?'purchases':'projects'} size={16}/></span>
    <div><strong>{entry.title}</strong><p>{entry.description}</p>
      <small>{shortDate(entry.date)}</small></div></div>):
    <p className="pv2-muted">No project activity recorded yet.</p>}
  </section>
  <section className="pv2-panel pv2-command-quick">
   <div className="pv2-command-head"><h2>Quick actions</h2></div>
   <div className="pv2-command-quick-actions">
    {d.site?.stage==='execution'&&
     <details><summary><OwnerIcon name="projects" size={16}/> Add work update</summary><SiteReportForm id={d.project.id}/></details>}
    {d.site?.stage==='execution'&&
     <details><summary><OwnerIcon name="projects" size={16}/> Add photo</summary><SiteMediaForm id={d.project.id}/></details>}
    {d.site?.canManage&&
     <details><summary><OwnerIcon name="team" size={16}/> Assign labour / team</summary>
      <p className="pv2-hint">Assign existing employees to this project. Daily labour counts are recorded with work updates.</p>
      <AssignRole projectId={d.project.id} users={d.site.memberOptions}/></details>}
    <Link href={cur(d.project.id,'documents')}><OwnerIcon name="quotations" size={16}/> Documents</Link>
    {d.permissions.finance&&<Link href={cur(d.project.id,'payments')}><OwnerIcon name="billing" size={16}/> Payment history</Link>}
   </div>
  </section>
 </aside>;
}
function ProjectWorkHub({d,showHistory=false}:{d:WorkspaceData;showHistory?:boolean}){
 return <div className="pv2-content pv2-command-workspace">
  <ProjectFinancialSummary d={d}/>
  <div className="pv2-command-layout">
   <ProjectStageBoard d={d}/>
   <ProjectCommandSidebar d={d} showHistory={showHistory}/>
  </div>
 </div>;
}
function Overview({d}:{d:WorkspaceData}){return <ProjectWorkHub d={d}/>;}

type Activity={id:string;date:string;title:string;kind:string;description:string;media?:SiteRow};
function timeline(d:WorkspaceData):Activity[]{
 const site=d.site,all:Activity[]=[];
 for(const row of site?.reports??[])all.push({id:row.id,title:'Daily work update',kind:'execution',
  date:stringValue(row.report_date),description:stringValue(row.completed_work)});
 for(const row of site?.materials??[])all.push({id:row.id,title:'Material: '+stringValue(row.item),kind:'material',
  date:stringValue(row.created_at),description:stringValue(row.quantity)+' '+stringValue(row.unit)+' · '+pretty(row.status)});
 for(const row of site?.checks??[])all.push({id:row.id,title:'Quality check: '+stringValue(row.title),kind:'check',
  date:stringValue(row.created_at),description:pretty(row.status)});
 for(const row of site?.media??[])all.push({id:row.id,title:'Site file: '+stringValue(row.filename),
  kind:'media',date:stringValue(row.created_at),description:stringValue(row.caption),media:row});
 for(const row of site?.gate??[])all.push({id:row.id,title:pretty(row.kind),kind:'gate',date:stringValue(row.created_at),
  description:stringValue(row.description)});
 return all.sort((a,b)=>b.date.localeCompare(a.date));
}
function Timeline({d}:{d:WorkspaceData}){return <ProjectWorkHub d={d} showHistory/>;}
function Documents({d}:{d:WorkspaceData}){
 const canSeeCommercial=d.permissions.quotation||d.permissions.finance;
 const photos=d.site?.media??[],agreement=photos.filter(r=>stringValue(r.category)==='agreement');
 const signedRecorded=d.agreement?.clearanceType==='signed_copy_recorded';
 const plans=photos.filter(r=>['plan','design'].includes(stringValue(r.category)));
 const other=photos.filter(r=>!['agreement','plan','design'].includes(stringValue(r.category)));
 const group=(title:string,list:SiteRow[])=> <section className="pv2-panel" key={title}>
  <Title title={title} detail={title==='Agreement'?'Signed project contract and supporting PDFs':title==='Plans & Drawings'?'Approved drawings and revisions':'Photographs and attached project documents'}/>
  {list.length?<div className="pv2-file-list">{list.map(row=><a key={row.id}
   href={'/dashboard/projects/'+d.project.id+'/site/media/'+row.id} className="pv2-file">
   <span className="pv2-file-icon"><OwnerIcon name="quotations" size={23}/></span>
   <span><strong>{stringValue(row.filename)}</strong><small>{shortDate(row.created_at)} · {stringValue(row.caption)||pretty(row.category)}</small></span>
   <b>View / Download</b></a>)}</div>:<Blank title="No files in this category" detail="Evidence uploaded through the project timeline appears here."/>}
 </section>;
 return <div className="pv2-content">
   {canSeeCommercial&&<>
    
    <section className="pv2-section-intro"><h2>Quotation & Agreement</h2>
     <p>Approved quotation and signed-contract archive. Continue tasks in the project timeline.</p></section>
    <section className="pv2-panel pv2-quote-links">
     <Title title="Final Quotation" detail="The quotation linked to this project's agreed scope."/>
     {d.quotations.length?<div className="pv2-file-list">{d.quotations.map(q=>
      <div className="pv2-commercial-row" key={q.id}>
       <div className="pv2-commercial-details"><strong>{q.number}</strong>
        <span><Status value={q.status==='draft'?'Saved':q.status}/><small>{shortDate(q.createdAt)}</small></span></div>
       <div className="pv2-commercial-actions">
        <NextLink href={'/dashboard/quotations/'+q.revisionId+'/preview'} label="Preview PDF"/>
        <NextLink href={'/dashboard/quotations/'+q.revisionId+'/studio?step=quote'} label={q.status==='draft'?'Edit saved quote':'Quote & payment plan'}/>

       </div>
       {q.status==='draft'&&<p className="pv2-muted">Saved and editable. Sharing/finalizing this quotation locks the agreed version before preparing an agreement; no separate client approval is needed.</p>}
      </div>)}</div>:
      <Blank title="No saved final quotation found"
       detail="No active quotation was found for this project or its converted Won lead."
       action={d.permissions.quotation?<NextLink href="/dashboard/quotations" label="Open Quotations"/>:undefined}/>}
     {d.permissions.quotation&&<details className="pv2-secondary-more"><summary>Quotation history / change Final</summary>
      <NextLink href="/dashboard/quotations" label="Manage quotation history"/>
     </details>}
    </section>
    <section className="pv2-panel pv2-agreement-status" id="project-agreement">
     <Title title="Agreement" detail="Recorded contract and signed-document history"/>
     {d.agreement?<div>
      <div className="pv2-between"><strong>{d.agreement.contractNumber}</strong>
       <Status value={signedRecorded?'signed':d.agreement.authorized?'approved':d.agreement.status||'pending'}/></div>
      {!signedRecorded&&d.quotations[0]&&d.agreement.revisionId&&d.quotations[0].revisionId!==d.agreement.revisionId?
       <p role="alert" className="pv2-form-feedback bad">The unsigned agreement references a different quotation. Confirm the agreed version before signing.</p>:
       <p className="pv2-muted">The agreement is tied to its saved quotation version. Payment schedule, signed evidence and advance remain required for execution.</p>}
      {signedRecorded&&<p className="pv2-muted">The signed agreement fixes the agreed quotation for this project. New alternatives stay in quotation history; changed signed scope requires a formal change order.</p>}
      {signedRecorded&&d.agreement.status==='pending'&&d.permissions.contractManage&&typeof d.agreement.version==='number'&&
       <ProjectContractActivation contractId={d.agreement.contractId} version={d.agreement.version}/>}

      {signedRecorded&&<p className="pv2-form-feedback good">Signed agreement recorded. No second upload or confirmation is needed.</p>}
      {agreement.length>0&&<div className="pv2-file-list" aria-label="Agreement PDFs">{agreement.map(row=>
       <a key={row.id} className="pv2-file"
        href={'/dashboard/projects/'+d.project.id+'/site/media/'+row.id}>
        <span className="pv2-file-icon"><OwnerIcon name="quotations" size={23}/></span>
        <span><strong>{stringValue(row.filename)}</strong><small>{shortDate(row.created_at)}</small></span>
        <b>View / Download</b>
       </a>)}</div>}
     </div>:<p className="pv2-muted">Prepare an agreement from the issued final quotation before uploading or recording a signed copy.</p>}
    </section>
   </>}
   <div className="pv2-section-intro"><h2>Project Documents</h2><p>Approved drawings, site photos and supporting records.</p></div>
   {!canSeeCommercial&&group('Agreement',agreement)}{group('Plans & Drawings',plans)}{group('Site Photos & Documents',other)}

 </div>;
}
function Payments({d}:{d:WorkspaceData}){
 if(!d.permissions.payments)return <Blank title="Finance permission required" detail="Only authorized finance users can view client receipts."/>;
 const paymentRows=d.transactions;
 const total=paymentRows?.filter(x=>x.status==='recorded').reduce((sum,x)=>sum+x.amount,0)??null;
 return <div className="pv2-content">
  
  <section className="pv2-stat-grid pv2-finance-metrics">
   <article className="pv2-stat"><small>Contract Value</small><strong>{formatMoney(d.contractValue)}</strong></article>
   <article className="pv2-stat"><small>Received</small><strong>{formatMoney(total)}</strong></article>
   <article className="pv2-stat"><small>Pending</small><strong>{formatMoney(d.contractValue!==null&&total!==null?Math.max(0,d.contractValue-total):null)}</strong></article>
  </section>
  <section className="pv2-panel"><Title title="Payment Schedule" detail="Milestones from active contract schedules. Requests are not receipts."
   action={<NextLink href={'/dashboard/finance?tab=payments'+(d.agreement?'&contract_id='+d.agreement.contractId:'')} label="Finance payments"/>}/>
   {d.milestones.length?<DataTable head={['Milestone','Amount','Contract','Actions']}>
    {d.milestones.map(m=><tr key={m.id}><td><strong>{m.label}</strong></td>
     <td>{m.currency} {m.amount}</td><td>{m.contract_number}</td>
     <td><NextLink href={'/dashboard/finance?tab=payments&contract_id='+m.contract_id} label="Finance ledger"/></td></tr>)}</DataTable>:
    <Blank title="No payment milestones" detail="Payment stages are copied from the signed quotation when the contract is activated."/>}
  </section>
  {!!d.quotePaymentTriggers.length&&<section className="pv2-panel">
    <Title title="Quoted Work-Linked Payments" detail="Quoted payment proposal; actual contract requests and receipts remain in Finance."/>
    <DataTable head={['Quoted milestone','Percentage','Associated work','Status']}>
      {d.quotePaymentTriggers.map((p,i)=><tr key={i}><td><strong>{p.name}</strong></td>
       <td>{p.percent}%</td><td>{p.stageCodes.length
        ?p.stageCodes.map(key=>d.stages.find(stage=>stage.instance_code===key)?.title??key).join(' · ')
        :'Custom milestone'}</td><td><span className="pv2-label">Not a receipt</span></td></tr>)}
    </DataTable>
  </section>}
  <section className="pv2-panel">
   <Title title="Stage payment requests" detail="Automatically created only when linked work passes independent quality certification. Requests do not confirm payment."/>
   {d.stageRequests?.length?<DataTable head={['Request','Issued','Amount','Status','PDF']}>
    {d.stageRequests.map(r=><tr key={r.id}>
     <td><strong>{r.number}</strong></td>
     <td><FieldDate value={r.date}/></td>
     <td>{formatMoney(r.amount)}</td><td><Status value={r.status}/></td>
     <td><NextLink href={'/dashboard/finance/requests/'+r.id+'/pdf'} label="Download request"/></td>
    </tr>)}
   </DataTable>:<Blank title="No stage payment requests yet" detail="The system issues the first eligible request when all required linked stages are certified. No payment has been assumed."/>}
  </section>
  <section className="pv2-panel"><Title title="Client Payment Transactions" detail="Read-only mirror of recorded and voided receipts in Finance"/>
   {paymentRows?.length?<DataTable head={['Receipt / Payment','Date','Amount','Status']}>
    {paymentRows.map(r=><tr key={r.id}><td><strong>{r.number}</strong></td><td><FieldDate value={r.date}/></td>
     <td>{formatMoney(r.amount)}</td><td><Status value={r.status}/></td></tr>)}</DataTable>:
    <Blank title="No payments recorded" detail="Record and allocate payments through the existing Finance module."/>}
  </section>
 </div>;
}
function Procurement({d}:{d:WorkspaceData}){
 const site=d.site,materials=site?.materials??[];
 return <div className="pv2-content">
  <section className="pv2-panel">
   <Title title="Procurement & Materials" detail="Requests, purchase orders and delivery statuses share one canonical register"
    action={<NextLink href="/dashboard/marketplace/orders" label="Purchase Orders"/>}/>
   <nav className="pv2-local-tabs"><span className="active">Requests ({materials.length})</span>
    <span>Purchase Orders ({d.purchaseOrders?.length??'—'})</span></nav>
   {materials.length?<div className="pv2-material-list">{materials.map(m=><article className="pv2-material" key={m.id}>
    <span className="pv2-material-icon"><OwnerIcon name="purchases" size={23}/></span>
    <div><strong>{stringValue(m.item)}</strong>
     <small>{stringValue(m.quantity)} {stringValue(m.unit)} · {shortDate(m.created_at)}</small>
     {Boolean(m.vendor_reference)&&<small>Supplier / order: {stringValue(m.vendor_reference)}</small>}</div>
    <Status value={stringValue(m.status)}/>
    {['ordered','received'].includes(stringValue(m.status))&&
     <small>{stringValue(m.status)==='received'?'Received at site':
       'Expected '+(stringValue(m.expected_delivery_date)?shortDate(m.expected_delivery_date):'date not set')+
       (stringValue(m.expected_delivery_window)?' · '+stringValue(m.expected_delivery_window):'')}</small>}
    <MaterialDeliveryActions projectId={d.project.id} material={{
      id:m.id,status:stringValue(m.status),source:stringValue(m.source),
      reference:stringValue(m.vendor_reference),
      date:stringValue(m.expected_delivery_date)||null,
      window:stringValue(m.expected_delivery_window)||null
    }} canOrder={d.materialAccess.canOrder}
       canReceive={site?.canManage===true||['site_engineer','manager','procurement'].includes(site?.role??'')}/>
    {site?.stage==='execution'&&site.role&&['manager','procurement'].includes(site.role)&&
     <MaterialUpdateForm id={d.project.id} material={{
      id:m.id,status:stringValue(m.status),source:stringValue(m.source),
      vendorReference:stringValue(m.vendor_reference),
     }}/>}
   </article>)}</div>:
    <Blank title="No material requests" detail="Site engineers and procurement staff can add requests throughout the project."/>}
   {site?.stage==='execution'&&['manager','procurement','site_engineer'].includes(site.role)&&
    <details className="pv2-edit-drawer"><summary>＋ Request Material</summary><MaterialRequestForm id={d.project.id}/></details>}
  </section>
  <section className="pv2-panel">
   <Title title="Purchase Orders" detail="Orders come from the existing procurement engine, never from a duplicate form."/>
   {d.purchaseOrders?.length?<DataTable head={['PO Number','Order Date','Status','Action']}>
    {d.purchaseOrders.map(po=><tr key={po.id}><td>{po.number}</td>
     <td><FieldDate value={po.date}/></td><td><Status value={po.status}/></td>
     <td><NextLink href="/dashboard/marketplace/orders" label="View"/></td></tr>)}</DataTable>:
    <Blank title="No purchase orders available" detail="Review requests, supplier decisions and actual orders in Procurement."/>}
  </section>
 </div>;
}
function Labour({d}:{d:WorkspaceData}){
 const reports=d.site?.reports??[];
 return <div className="pv2-content">
  <section className="pv2-panel">
   <Title title="Labour & Site Attendance" detail="Daily workforce counts and field gate entries"
    action={<NextLink href={'/dashboard/billing/labour?project='+d.project.id} label="Labour payments"/>}/>
   {reports.length?<DataTable head={['Work date','On site','Required tomorrow','Work']}>
    {reports.map(r=><tr key={r.id}><td><FieldDate value={r.report_date}/></td>
     <td>{stringValue(r.worker_count)||'—'}</td><td>{stringValue(r.tomorrow_workers)||'—'}</td>
     <td>{stringValue(r.completed_work)}</td></tr>)}</DataTable>:
    <Blank title="No workforce reports yet" detail="Engineer work updates also record the number of labourers on site."/>}
  </section>
  <section className="pv2-panel">
   <Title title="Curing, Security & Gate Register" detail="Repeated labour, material delivery and site-security observations"/>
   {d.site?.gate.length?<div className="pv2-history">{d.site.gate.map(r=><div className="pv2-history-row" key={r.id}>
    <span><strong>{pretty(r.kind)}</strong><small>{shortDate(r.created_at)}</small></span>
    <p>{stringValue(r.description)}</p></div>)}</div>:<Blank title="No entries" detail="Watchman and manager can record site rounds and material arrivals."/>}
   {d.site?.stage==='execution'&&['manager','watchman'].includes(d.site.role)&&
    <details className="pv2-edit-drawer"><summary>＋ Add gate / curing entry</summary><GateForm id={d.project.id}/></details>}
  </section>
 </div>;
}
function Execution({d}:{d:WorkspaceData}){
 const rows=d.site?.reports??[];
 return <div className="pv2-content">
  <section className="pv2-panel">
   <Title title="Execution Updates" detail="Photos, reports, labour counts and progress are recorded repeatedly"
    action={<span className="pv2-label">{rows.length} recorded updates</span>}/>
   {rows.length?<div className="pv2-execution-list">{rows.map(row=><article className="pv2-execution" key={row.id}>
    <div><strong>{stringValue(row.completed_work)}</strong><Status value="recorded"/></div>
    <small>{shortDate(row.report_date)} · {stringValue(row.worker_count)} workers</small>
    <p>Tomorrow: {stringValue(row.tomorrow_plan)}</p>
    {Boolean(row.blockers)&&<small>Blockers: {stringValue(row.blockers)}</small>}
   </article>)}</div>:<Blank title="No daily execution reports" detail="When work starts, site engineers can record daily updates here."/>}
   <PhotoStrip projectId={d.project.id} rows={d.site?.media??[]}/>
   {d.site?.stage==='execution'&&['manager','site_engineer'].includes(d.site.role)&&
    <details className="pv2-edit-drawer"><summary>＋ Add Work Update</summary><SiteReportForm id={d.project.id}/></details>}
   {d.site?.stage==='execution'&&
    <details className="pv2-edit-drawer"><summary>＋ Upload Work Photos</summary><SiteMediaForm id={d.project.id}/></details>}
  </section>
 </div>;
}
function Checks({d}:{d:WorkspaceData}){
 const checks=d.site?.checks??[];
 return <div className="pv2-content"><section className="pv2-panel">
  <Title title="Checks & Quality" detail="Repeated structural checks, passes, failed checks and re-inspections"/>
  {checks.length?<DataTable head={['Inspection','Date','Status','Action']}>
   {checks.map(c=><tr key={c.id}><td><strong>{stringValue(c.title)}</strong>
    <small>{stringValue(c.notes)}</small></td><td><FieldDate value={c.due_date||c.created_at}/></td>
    <td><Status value={stringValue(c.status)}/></td><td>
     {d.site?.stage==='execution'&&['manager','quality_inspector','site_engineer'].includes(d.site.role)&&
      stringValue(c.status)!=='passed'&&<ReviewCheck id={d.project.id} checkId={c.id}/>}
    </td></tr>)}</DataTable>:<Blank title="No checks yet" detail="Record inspections and follow up until each check passes."/>}
  {d.site?.stage==='execution'&&['manager','quality_inspector','site_engineer'].includes(d.site.role)&&
   <details className="pv2-edit-drawer"><summary>＋ Add Check</summary><QualityForm id={d.project.id}/></details>}
 </section></div>;
}
function Designs({d}:{d:WorkspaceData}){
 const rows=d.site?.designs??[],designFiles=d.site?.media.filter(x=>['design','plan'].includes(stringValue(x.category)))??[];
 return <div className="pv2-content"><section className="pv2-panel">
  <Title title="Designs & Plans" detail="Floor plans, structural drawings, revision numbers and design approvals"/>
  {rows.length?<DataTable head={['Design','Revision','Reference','Status']}>
   {rows.map(x=><tr key={x.id}><td><strong>{pretty(x.kind)}</strong></td>
    <td>Rev {stringValue(x.revision)}</td><td>{stringValue(x.reference)}</td>
    <td><Status value={stringValue(x.status)}/></td></tr>)}</DataTable>:
   <Blank title="No design revisions" detail="Architects and structural designers can submit revisioned plans during the design stage."/>}
  {designFiles.length>0&&<div className="pv2-file-list">{designFiles.map(f=><a key={f.id}
   href={'/dashboard/projects/'+d.project.id+'/site/media/'+f.id} className="pv2-file">
   <OwnerIcon name="quotations" size={20}/><strong>{stringValue(f.filename)}</strong><span>Download</span></a>)}</div>}
  <p className="pv2-muted">Drawing uploads and approvals are handled in the project's design timeline stage.</p>
 </section></div>;
}
function Team({d}:{d:WorkspaceData}){
 const people=d.site?.team??[],users=d.site?.memberOptions??[];
 return <div className="pv2-content"><section className="pv2-panel">
  <Title title="Team & Access" detail="Project-specific staff and client access; no duplicate company employee records"
   action={<NextLink href="/dashboard/company/team" label="Company Team"/>}/>
  {people.length?<div className="pv2-team-list">{people.map(row=><div className="pv2-person" key={row.id}>
   <span className="pv2-person-avatar">{pretty(row.role).slice(0,1)||'T'}</span>
   <div><strong>{users.find(x=>x.id===row.user_id)?.label||'Assigned project member'}</strong>
    <small>{pretty(row.role)}</small></div><Status value={row.active===true?'active':'inactive'}/>
  </div>)}</div>:<Blank title="No project assignments" detail="Invite existing company staff to this project without copying employee profiles."/>}
  {d.site?.canManage&&users.length>0&&<details className="pv2-edit-drawer">
   <summary>＋ Add Project Team Member</summary><AssignRole projectId={d.project.id} users={users}/></details>}
  {d.site?.canManage&&users.length>0&&<MaterialOrderingAccess projectId={d.project.id}
     users={users} grants={d.materialAccess.grants}/>}
 </section>
 <p className="pv2-muted">Use “Share with client” in the project header to invite or revoke access for this exact project.</p></div>;
}
const pages:{[key in ProjectPageSlug]:(p:{d:WorkspaceData})=>React.ReactNode}={
 overview:Overview,timeline:Timeline,documents:Documents,payments:Payments,
 procurement:Procurement,labour:Labour,execution:Execution,checks:Checks,designs:Designs,team:Team,
};
export async function ProjectV2Page({id,view}:{id:string;view:ProjectPageSlug}){
 const data=await projectWorkspace(id);
 const organization=await activeOrganization();
 const nav=organization?ownerWorkspaceNavigation(organization):[];
 const Component=pages[view];
 return <OwnerShell companyName={data.company} accountLabel={data.email.split('@')[0]||'Company member'}
  accountEmail={data.email} planLabel="Business workspace" currentHref="/dashboard/projects"
  navigation={nav} search="" notificationsEnabled={organization?canAccess(organization,{
   organizationId:organization.organizationId,permission:'notification.view'}):false} dashboardBrand>
  <main className="pv2-page" id="main-content">
   <nav className="pv2-crumb" aria-label="Breadcrumb"><Link href="/dashboard/projects">Projects</Link>
    <span>›</span><Link href={cur(data.project.id,'overview')}>{data.project.name}</Link>
    <span>›</span><strong>{projectPages.find(x=>x.slug===view)?.title}</strong></nav>
   <ProjectHeader data={data} active={view}/>
   <section className="pv2-view">{Component&&<Component d={data}/>}</section>
  </main>
  <OwnerMobileNav currentHref="/dashboard/projects"
   navigation={nav.filter(item=>['Dashboard','Projects','My Sites','Finance','Team','Settings'].includes(item.label))
    .filter(item=>item.label!=='My Sites'||!nav.some(x=>x.label==='Projects')).slice(0,5)}/>
 </OwnerShell>;
}
