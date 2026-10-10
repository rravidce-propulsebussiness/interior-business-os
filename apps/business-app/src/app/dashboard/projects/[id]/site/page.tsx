import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import {
  activeOrganization,
  pageServices,
} from '@business-os/auth/server';
import { ProjectSiteForm, ProjectSiteMediaForm, type SiteField } from './forms';

export const dynamic = 'force-dynamic';

const row = z.object({ id: z.uuid() }).passthrough();
const siteSchema = z.object({
  project: z.object({ id: z.uuid(), name: z.string(), code: z.string() }),
  stage: z.enum(['not_started','design','client_approved','execution','handover']),
  role: z.string().nullable(),
  can_manage: z.boolean(),
  approval_evidence: z.string().nullable().optional(),
  client_approval_recorded_at: z.string().nullable().optional(),
  team: z.array(row),
  member_options: z.array(z.object({ id: z.uuid(), label: z.string() })),
  designs: z.array(row),
  reports: z.array(row),
  materials: z.array(row),
  checks: z.array(row),
  gate: z.array(row),
  media: z.array(row),
  events: z.array(z.record(z.string(),z.unknown())),
});
type Site = z.infer<typeof siteSchema>;
const stages = [
  {key:'design',title:'Design & engineering',sub:'Architecture · 3D · structure'},
  {key:'client_approved',title:'Client approval',sub:'Record approval evidence'},
  {key:'execution',title:'Site execution',sub:'Marking · materials · daily reports'},
  {key:'handover',title:'Quality & handover',sub:'Complete outstanding checks'},
] as const;

function value(row: Record<string, unknown>, key: string) {
  const field = row[key];
  return typeof field === 'string' || typeof field === 'number' ? String(field) : '';
}
function display(value: string) { return value.replaceAll('_',' '); }
const card = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6';
const formDetails = 'mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4';
const green = 'rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800';
const gray = 'rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700';
const designKinds = [
  { value:'architectural_plan',label:'Architectural plan' },
  { value:'3d_design',label:'3D design / elevation' },
  { value:'structural_design',label:'Structural drawings' },
];
const supplierOptions = [
  { value:'marketplace',label:'Business OS marketplace seller' },
  { value:'outside',label:'Outside supplier' },
  { value:'undecided',label:'Not selected' },
];
const unitOptions=['bags','kg','tonnes','litres','nos','sqft','sqm','cft','cum','yards','metres','feet'].map(x=>({value:x,label:x}));
function Action({
  project,operation,label,fields,hidden,
}: {
  project:string;operation:string;label:string;fields:SiteField[];hidden?:Record<string,string>;
}) {
  return <ProjectSiteForm project={project} operation={operation} label={label} fields={fields} hidden={hidden ?? {}} secondary />;
}
function Heading({eyebrow,title,detail}:{eyebrow:string;title:string;detail:string}) {
  return <div className="mb-5">
    <p className="text-xs font-bold uppercase tracking-[.18em] text-blue-700">{eyebrow}</p>
    <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-950">{title}</h2>
    <p className="mt-1 text-sm leading-6 text-slate-600">{detail}</p>
  </div>;
}

export default async function ProjectDeliveryPage({
  params,
}: {
  params:Promise<{id:string}>;
}) {
  const {id} = await params;
  if(!z.uuid().safeParse(id).success) notFound();
  const s=await pageServices();
  const context=await activeOrganization();
  if(!context) notFound();
  const result=await s.client.rpc('project_site_read',{
    p_organization_id:context.organizationId,p_project_id:id,
  });
  if(result.error) notFound();
  const parsed=siteSchema.safeParse(result.data);
  if(!parsed.success) notFound();
  const site:Site=parsed.data;
  const role=site.role;
  const manager=site.can_manage;
  const isDesign=manager||role==='architect'||role==='structural_designer';
  const isEngineer=manager||role==='site_engineer';
  const isQuality=manager||role==='quality_inspector'||role==='site_engineer';
  const isProcurement=manager||role==='procurement';
  const isWatchman=manager||role==='watchman';
  const phaseIndex=site.stage==='not_started'?-1:stages.findIndex(s=>s.key===site.stage);
  const open=site.stage==='execution';
  const pendingChecks=site.checks.filter(c=>value(c,'status')!=='passed');
  const pendingMaterials=site.materials.filter(m=>!['received','rejected'].includes(value(m,'status')));
  const latestDesigns=designKinds.map(kind=>({
    ...kind,
    latest:site.designs.filter(d=>value(d,'kind')===kind.value)
      .sort((a,b)=>Number(b.revision)-Number(a.revision))[0],
  }));

  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-7">
      <div className="mx-auto max-w-7xl space-y-6">
        <nav aria-label="Breadcrumb" className="flex flex-wrap gap-2 text-sm text-slate-600">
          <Link className="hover:underline" href="/dashboard/projects">Projects</Link>
          <span>/</span>
          <Link className="hover:underline" href={`/dashboard/projects/${id}`}>{site.project.name}</Link>
          <span>/ Site delivery</span>
        </nav>

        <header className="rounded-3xl bg-slate-950 p-6 text-white shadow-xl sm:p-9">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="max-w-3xl">
              <p className="text-xs font-bold uppercase tracking-[.18em] text-teal-300">Business OS · Project delivery</p>
              <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{site.project.name}</h1>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                From approved drawings to marking, materials, daily execution and quality handover.
                Work stays inside the company project workspace.
              </p>
            </div>
            <div className="rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm">
              <p className="text-slate-300">Your access</p>
              <strong className="mt-1 block capitalize">{display(role??'none')}</strong>
              <p className="mt-1 text-slate-300">{site.project.code}</p>
            </div>
          </div>
          <div className="mt-7 grid gap-2 sm:grid-cols-4">
            {stages.map((stage,index)=>(
              <div className={`rounded-xl border p-3 ${phaseIndex>=index?'border-teal-400 bg-teal-400/10':'border-white/15 bg-white/5'}`} key={stage.key}>
                <p className="text-xs text-slate-300">0{index+1}</p>
                <strong className="mt-1 block text-sm">{stage.title}</strong>
                <small className="text-xs text-slate-300">{stage.sub}</small>
              </div>
            ))}
          </div>
        </header>

        {site.stage==='not_started' && (
          <section className={card}>
            <Heading eyebrow="Set up" title="Start the project delivery workflow" detail="A company manager initiates delivery after creating the customer project. The design stage starts first." />
            {manager
              ? <Action project={id} operation="initialize" label="Initialize design stage" fields={[]}/>
              : <p className="text-sm text-amber-800">Ask your project manager to initialize the delivery process.</p>}
          </section>
        )}

        {manager && site.stage!=='not_started' && (
          <section className={card}>
            <Heading eyebrow="Project access" title="Assign the right people" detail="Architects and structural designers prepare drawings. After client approval, the site engineer, watchman, QA and procurement team take over. Only assigned employees can access this project." />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {site.team.filter(t=>t.active).map(member=>(
                <div className="flex items-center justify-between rounded-xl border border-slate-200 p-3 text-sm" key={member.id}>
                  <span>{site.member_options.find(m=>m.id===member.user_id)?.label??value(member,'user_id').slice(0,8)}</span>
                  <span className={gray}>{display(value(member,'role'))}</span>
                </div>
              ))}
            </div>
            <details className={formDetails}>
              <summary className="cursor-pointer font-semibold">Assign or change an employee's project role</summary>
              <div className="mt-4">
                <Action project={id} operation="assign" label="Save project access" fields={[
                  {name:'user_id',label:'Active company member',input:'select',required:true,options:site.member_options.map(x=>({value:x.id,label:x.label}))},
                  {name:'role',label:'Project role',input:'select',required:true,options:['manager','architect','structural_designer','site_engineer','watchman','quality_inspector','procurement'].map(x=>({value:x,label:display(x)}))},
                  {name:'active',label:'Access',input:'select',required:true,options:[{value:'true',label:'Enable'},{value:'false',label:'Revoke'}],initial:'true'},
                ]}/>
              </div>
            </details>
          </section>
        )}

        {(isDesign||manager||role==='site_engineer'||role==='quality_inspector') && site.stage!=='not_started' && (
          <section className={card}>
            <Heading eyebrow="Stage 1" title="Design and technical approval" detail="Latest architectural plan, 3D design and structural revision must each be reviewed before client approval can be recorded." />
            <div className="grid gap-4 md:grid-cols-3">
              {latestDesigns.map(kind=>{
                const current=kind.latest;
                return <article className="rounded-xl border border-slate-200 bg-slate-50 p-4" key={kind.value}>
                  <h3 className="font-semibold">{kind.label}</h3>
                  {current ? <>
                    <p className="mt-2 text-xs text-slate-500">Revision {value(current,'revision')}</p>
                    <span className={value(current,'status')==='approved'?green:gray}>{display(value(current,'status'))}</span>
                    <p className="mt-2 break-all text-sm">{value(current,'reference')}</p>
                    {value(current,'review_note') && <p className="mt-2 text-xs text-slate-600">Review: {value(current,'review_note')}</p>}
                    {manager&&site.stage==='design'&&value(current,'status')==='submitted'&&(
                      <div className="mt-4 space-y-3">
                        <Action project={id} operation="design_decide" label="Approve drawing" hidden={{id:String(current.id),decision:'approved',note:''}} fields={[]}/>
                        <Action project={id} operation="design_decide" label="Request changes" hidden={{id:String(current.id),decision:'changes_requested'}} fields={[{name:'note',label:'Changes required',required:true}]}/>
                      </div>
                    )}
                  </> : <p className="mt-2 text-sm text-slate-600">Not submitted</p>}
                </article>;
              })}
            </div>
            {isDesign&&site.stage==='design'&&(
              <details className={formDetails}>
                <summary className="cursor-pointer font-semibold">Submit a drawing or revised design</summary>
                <div className="mt-4">
                  <Action project={id} operation="design_submit" label="Submit for technical review" fields={[
                    {name:'kind',label:'Design deliverable',input:'select',required:true,options:designKinds},
                    {name:'reference',label:'Drawing reference or uploaded evidence filename',required:true,placeholder:'Example: Structural drawing STR-02 / uploaded file name'},
                    {name:'notes',label:'Revision notes',input:'textarea'},
                  ]}/>
                </div>
              </details>
            )}
            {site.stage==='design'&&manager&&(
              <details className={formDetails}>
                <summary className="cursor-pointer font-semibold">Record client approval and release drawings</summary>
                <p className="my-3 text-sm text-slate-600">Record how the client approved the final revisions, including date and evidence. This is a staff-recorded acknowledgement, not a client digital signature.</p>
                <Action project={id} operation="client_approve" label="Record client's design approval" fields={[
                  {name:'evidence',label:'Client approval evidence (date, message or signed reference)',input:'textarea',required:true,placeholder:'Approved latest revisions by email/meeting on …'},
                ]}/>
              </details>
            )}
          </section>
        )}

        {site.stage==='client_approved' && manager && (
          <section className={card}>
            <Heading eyebrow="Stage 2" title="Design approved. Begin site work" detail="Confirm marking readiness, assign the site team and begin execution. This step is blocked until all three designs have been approved and client approval evidence has been recorded."/>
            <p className="mb-4 text-sm text-slate-600">Approval recorded: {site.client_approval_recorded_at??'—'}</p>
            <Action project={id} operation="execution_start" label="Authorize site execution" fields={[]}/>
          </section>
        )}

        {(open||site.stage==='handover') && (isEngineer||isQuality||isProcurement||isWatchman) && (
          <section className="grid gap-4 md:grid-cols-3">
            <article className={card}><p className="text-xs uppercase tracking-wider text-slate-500">Latest site reports</p><strong className="mt-2 block text-3xl">{site.reports.length}</strong><p className="mt-1 text-sm text-slate-600">Recorded entries</p></article>
            <article className={card}><p className="text-xs uppercase tracking-wider text-slate-500">Checks required</p><strong className="mt-2 block text-3xl">{pendingChecks.length}</strong><p className="mt-1 text-sm text-slate-600">Pending, failed or recheck</p></article>
            <article className={card}><p className="text-xs uppercase tracking-wider text-slate-500">Material needs</p><strong className="mt-2 block text-3xl">{pendingMaterials.length}</strong><p className="mt-1 text-sm text-slate-600">Not yet received or rejected</p></article>
          </section>
        )}

        {(isEngineer||isQuality) && (open||site.stage==='handover') && (
          <section className={card}>
            <Heading eyebrow="Stage 3" title="Daily site execution" detail="Site engineer records completed work, today's labour, blockers, tomorrow's tasks, checks completed and checks required. Add photo or video evidence below."/>
            {open && isEngineer&&(
              <details className={formDetails} open={site.reports.length===0}>
                <summary className="cursor-pointer font-semibold">Submit daily progress update</summary>
                <div className="mt-4">
                  <Action project={id} operation="report_add" label="Publish site report" fields={[
                    {name:'report_date',label:'Work date',input:'date',required:true,initial:new Date().toISOString().slice(0,10)},
                    {name:'worker_count',label:'Workers on site',input:'number',required:true,initial:'0'},
                    {name:'completed_work',label:'Work completed today',input:'textarea',required:true,placeholder:'Marking, footing, concrete, brickwork…'},
                    {name:'tomorrow_plan',label:'Planned work for tomorrow',input:'textarea',required:true},
                    {name:'blockers',label:'Delays / blockers',input:'textarea'},
                    {name:'checks_done',label:'Checks completed',input:'textarea'},
                    {name:'checks_required',label:'Checks required / due next',input:'textarea'},
                  ]}/>
                </div>
              </details>
            )}
            <div className="mt-4 space-y-3">
              {site.reports.map(report=>(
                <article key={report.id} className="rounded-xl border border-slate-200 p-4 text-sm">
                  <div className="flex flex-wrap justify-between gap-2"><strong>{value(report,'report_date')}</strong><span className={gray}>{value(report,'worker_count')} workers</span></div>
                  <p className="mt-3"><strong>Completed:</strong> {value(report,'completed_work')}</p>
                  <p className="mt-2"><strong>Tomorrow:</strong> {value(report,'tomorrow_plan')}</p>
                  {value(report,'blockers')&&<p className="mt-2 text-amber-800"><strong>Blockers:</strong> {value(report,'blockers')}</p>}
                  {value(report,'checks_done')&&<p className="mt-2"><strong>Checks done:</strong> {value(report,'checks_done')}</p>}
                  {value(report,'checks_required')&&<p className="mt-2"><strong>Checks required:</strong> {value(report,'checks_required')}</p>}
                </article>
              ))}
              {!site.reports.length&&<p className="text-sm text-slate-500">No site reports recorded yet.</p>}
            </div>
          </section>
        )}

        {(isEngineer||isProcurement) && (open||site.stage==='handover') && (
          <section className={card}>
            <Heading eyebrow="Materials" title="Quantities and purchasing" detail="Request measured quantities for site marking and execution, approve procurement, then record whether the actual purchase is from a Business OS seller or an outside supplier. A request does not itself create a purchase order."/>
            <div className="flex flex-wrap gap-3 text-sm">
              <Link className="font-semibold text-blue-700 underline" href={`/dashboard/execution?project=${id}`}>Approved estimate &amp; BOQ →</Link>
              <Link className="font-semibold text-blue-700 underline" href={`/dashboard/execution/purchase_orders?project=${id}`}>Purchase orders →</Link>
              <Link className="font-semibold text-blue-700 underline" href="/dashboard/marketplace">Marketplace sellers →</Link>
            </div>
            {open&&(isEngineer||isProcurement)&&(
              <details className={formDetails}>
                <summary className="cursor-pointer font-semibold">Request material / planned quantity</summary>
                <div className="mt-4">
                  <Action project={id} operation="material_add" label="Add site material request" fields={[
                    {name:'item',label:'Material',required:true,placeholder:'Cement / steel / sand / electrical conduit'},
                    {name:'quantity',label:'Required quantity',input:'number',required:true},
                    {name:'unit',label:'Unit',input:'select',required:true,options:unitOptions},
                    {name:'notes',label:'BOQ reference, marking or usage notes',input:'textarea'},
                  ]}/>
                </div>
              </details>
            )}
            <div className="mt-4 space-y-3">
              {site.materials.map(m=>(
                <article key={m.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2"><strong>{value(m,'item')}</strong><span className={gray}>{display(value(m,'status'))}</span></div>
                  <p className="mt-1 text-sm text-slate-600">{value(m,'quantity')} {value(m,'unit')} · {display(value(m,'source'))}</p>
                  {value(m,'vendor_reference')&&<p className="mt-1 text-xs text-slate-600">Supplier/PO reference: {value(m,'vendor_reference')}</p>}
                  {open&&isProcurement&&['requested','approved','ordered'].includes(value(m,'status'))&&(
                    <details className={formDetails}>
                      <summary className="cursor-pointer text-sm font-semibold">Record procurement decision</summary>
                      <div className="mt-3">
                        <Action project={id} operation="material_update" label="Save procurement status" hidden={{id:String(m.id)}} fields={[
                          {name:'status',label:'Next status',input:'select',required:true,options:
                            (value(m,'status')==='requested'?['approved','rejected']:value(m,'status')==='approved'?['ordered']:['received']).map(v=>({value:v,label:display(v)}))},
                          {name:'source',label:'Purchase source',input:'select',required:true,options:supplierOptions,initial:value(m,'source')},
                          {name:'vendor_reference',label:'Seller / external supplier / actual PO reference',placeholder:'Required once ordered or received'},
                        ]}/>
                      </div>
                    </details>
                  )}
                </article>
              ))}
              {!site.materials.length&&<p className="text-sm text-slate-500">No materials requested yet.</p>}
            </div>
          </section>
        )}

        {isQuality&&(open||site.stage==='handover')&&(
          <section className={card}>
            <Heading eyebrow="Quality" title="Checks done and checks required" detail="Create marking and quality checks, record pass/fail and rechecks. Formal template-driven inspections and snags remain available in the existing site execution module."/>
            <div className="mb-4 flex flex-wrap gap-3 text-sm">
              <Link className="text-blue-700 underline" href={`/dashboard/operations/project_inspections?project=${id}`}>Formal inspections →</Link>
              <Link className="text-blue-700 underline" href={`/dashboard/operations/project_snags?project=${id}`}>Site snags →</Link>
            </div>
            {open&&(
              <details className={formDetails}>
                <summary className="cursor-pointer font-semibold">Create a required quality check</summary>
                <div className="mt-3">
                  <Action project={id} operation="check_add" label="Add check" fields={[
                    {name:'title',label:'Check description',required:true,placeholder:'Marking gridline levels / steel cover / curing…'},
                    {name:'due_date',label:'Due date',input:'date'},
                    {name:'notes',label:'Inspection notes',input:'textarea'},
                  ]}/>
                </div>
              </details>
            )}
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {site.checks.map(c=>(
                <article key={c.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap justify-between gap-2"><strong>{value(c,'title')}</strong><span className={value(c,'status')==='passed'?green:gray}>{display(value(c,'status'))}</span></div>
                  <p className="mt-1 text-xs text-slate-500">{value(c,'due_date')?'Due '+value(c,'due_date'):''}</p>
                  {open&&value(c,'status')!=='passed'&&(
                    <details className={formDetails}>
                      <summary className="cursor-pointer text-sm font-semibold">Record check result</summary>
                      <div className="mt-3">
                        <Action project={id} operation="check_update" label="Save check result" hidden={{id:String(c.id)}} fields={[
                          {name:'status',label:'Result',input:'select',required:true,options:['passed','failed','recheck'].map(x=>({value:x,label:display(x)}))},
                          {name:'notes',label:'Check evidence / notes',input:'textarea'},
                        ]}/>
                      </div>
                    </details>
                  )}
                </article>
              ))}
            </div>
          </section>
        )}

        {isWatchman&&(open||site.stage==='handover')&&(
          <section className={card}>
            <Heading eyebrow="Security &amp; curing" title="Gate register and site rounds" detail="Watchman records material delivery arrivals, visitors, labour entry, security checks and curing rounds without access to quotations or purchase costs."/>
            {open&&(
              <details className={formDetails} open={site.gate.length===0}>
                <summary className="cursor-pointer font-semibold">Record site event</summary>
                <div className="mt-3">
                  <Action project={id} operation="gate_add" label="Save gate log" fields={[
                    {name:'kind',label:'Entry type',input:'select',required:true,options:['material_delivery','visitor','labour','security_round','curing'].map(x=>({value:x,label:display(x)}))},
                    {name:'description',label:'What happened',input:'textarea',required:true},
                    {name:'notes',label:'Truck number, count, area or timings',input:'textarea'},
                  ]}/>
                </div>
              </details>
            )}
            <div className="mt-4 space-y-2">
              {site.gate.map(entry=>(
                <p className="rounded-xl border border-slate-200 p-3 text-sm" key={entry.id}>
                  <strong className="capitalize">{display(value(entry,'kind'))}</strong> · {value(entry,'description')}
                  <small className="ml-2 text-slate-500">{value(entry,'created_at').slice(0,16).replace('T',' ')}</small>
                </p>
              ))}
            </div>
          </section>
        )}

        {(isDesign||isEngineer||isQuality)&&['design','execution'].includes(site.stage)&&(
          <section className={card}>
            <Heading eyebrow="Evidence" title="Drawings, photos and progress clips" detail="Private uploads are restricted to assigned project roles. Each file can be up to 8 MB; large video storage needs the planned object-storage integration."/>
            <ProjectSiteMediaForm project={id} phase={site.stage as 'design'|'execution'}/>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {site.media.map(m=>(
                <a className="rounded-xl border border-slate-200 p-3 hover:border-blue-400" key={m.id}
                  href={`/dashboard/projects/${id}/site/media/${m.id}`}
                  target="_blank" rel="noopener noreferrer">
                  <p className="truncate text-sm font-semibold">{value(m,'filename')}</p>
                  <p className="mt-1 text-xs text-slate-500">{display(value(m,'category'))} · {value(m,'mime')}</p>
                  <p className="mt-2 text-xs text-slate-600">{value(m,'caption')}</p>
                  <span className="mt-2 block text-xs font-semibold text-blue-700">Open evidence ↗</span>
                </a>
              ))}
            </div>
          </section>
        )}

        {manager && open&&(
          <section className={card}>
            <Heading eyebrow="Stage 4" title="Quality clearance and handover" detail="The system checks formal inspections, task completion, open snags, site checklists and outstanding materials before allowing the project to move to handover."/>
            <p className="mb-4 text-sm text-slate-700">Pending site checks: {pendingChecks.length} · Material items awaiting closure: {pendingMaterials.length}</p>
            <Action project={id} operation="handover" label="Validate and mark ready for handover" fields={[]}/>
            <Link className="ml-3 text-sm font-semibold text-blue-700 underline" href={`/dashboard/operations/closure?project=${id}`}>Full physical completion review →</Link>
          </section>
        )}

        <footer className="flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <Link className="font-semibold text-blue-700 underline" href={`/dashboard/operations?project=${id}`}>Schedule, tasks &amp; inspections →</Link>
          <Link className="font-semibold text-blue-700 underline" href={`/dashboard/execution?project=${id}`}>BOQ, procurement &amp; receipts →</Link>
        </footer>
      </div>
    </main>
  );
}
