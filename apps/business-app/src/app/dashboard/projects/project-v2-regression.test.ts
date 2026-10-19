import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const read=(name:string)=>readFileSync(new URL(name,import.meta.url),'utf8');
const page=read('./page.tsx'),detail=read('./[id]/page.tsx'),
 sections=read('./[id]/[section]/page.tsx'),ui=read('./project-v2-view.tsx'),
 loader=read('./project-v2-data.ts'),forms=read('./project-v2-forms.tsx');
describe('Projects v2 one screen per route',()=>{
 it('restores project listing and deep links',()=>{
  expect(page).toContain('ProjectsDirectory');expect(detail).toContain('ProjectV2Page');
  expect(sections).toContain('ProjectV2Page');expect(ui).toContain('projectPages');
  expect(page).not.toContain('Ready for a fresh workspace');
 });
 it('keeps individual modules separate instead of one long stack',()=>{
  for(const name of ['Overview','Timeline','Documents','Payments','Procurement','Labour',
   'Execution','Checks','Designs & Plans','Team & Access'])expect(ui).toContain(name);
  expect(ui).toContain("pages[view]");
  expect(ui).not.toContain('pcc-module-grid');
  expect(ui).not.toContain('pcc-section-columns');
 });
 it('explains the missing agreement instead of allowing an invalid stage import',()=>{
  expect(ui).toContain("Prepare the agreement from the issued Final quotation");
  expect(ui).toContain("d.agreement&&<SyncStages");
  expect(ui).toContain('Agreement & advance');
  expect(ui).toContain('Project timeline');
  expect(ui).toContain('guidanceForConstructionStage');
  expect(ui).toContain('ProjectStageLinker');
  expect(loader).toContain('quotePaymentTriggers');
 });
 it('writes once through existing permission-checked actions',()=>{
  for(const name of ['saveProjectSite','uploadProjectSiteMedia','assignConstructionRole'])
   expect(forms).toContain(name);
  expect(loader).toContain("project_site_read");
  expect(loader).toContain("construction_project_read");
  expect(loader).toContain('workCompletionByProject');
  expect(ui).toContain("status==='recorded'");
  expect(loader).toContain('expenditure:null');
  expect(ui).toContain('Finance workspace');
 });
});

 
it('shows only the selected Final saved quotation on a converted project',()=>{
  expect(ui).toContain("slug:'documents',title:'Quote & Agreement'");
  expect(ui).toContain('title="Final Quotation"');
  expect(ui).toContain("q.status==='draft'?'Saved':q.status");
  expect(ui).toContain("Quotation history / change Final");
  expect(ui).toContain('label="Open agreement & schedule"');
  expect(loader).toContain("quotation:has('quotation.view','quotation')");
  expect(loader).toContain("'quotation_final_choices'");
  expect(loader).toContain('finalRoot=quoteRoots.find');
  expect(loader).toContain('const quotations:ProjectQuotation[]=finalRoot');
  expect(loader).toContain("lead_quotation_list");
  expect(loader).toContain("quotations:[]");
});
it('does not imply an old agreement automatically covers a newer final quote',()=>{
  expect(ui).toContain("not the currently selected Final quotation");
  expect(loader).toContain("revisionId:contract.data?.find");
});


it('uses one agreement upload and signing-evidence action without duplicate project controls',()=>{
 const action=read('./[id]/site/agreement-actions.ts');
 expect(ui).toContain('SignedAgreementUploadForm');
 expect(ui).toContain("Upload or record signed agreement");
 expect(ui).not.toContain('<SignedAgreementForm');
 expect(ui).not.toContain('<AgreementPdfUpload');
 expect(ui).toContain("!canSeeCommercial&&group('Agreement',agreement)");
 expect(forms).toContain('export function SignedAgreementUploadForm');
 expect(forms).toContain('saveSignedAgreement(projectId,contractId,form)');
 expect(forms).not.toContain('export function AgreementPdfUpload');
 expect(forms).not.toContain('export function SignedAgreementForm');
 expect(forms).not.toContain("'inspection','agreement','design'");
 expect(action).toContain("export async function saveSignedAgreement(");
 expect(action).toContain("p_action: 'record_signed_pdf'");
 expect(action).toContain("p_category: 'agreement'");
 expect(action).toContain("uploaded: true");
});

it('starts at a real floor plan action after signed agreement, before final design confirmation',()=>{
 const drawing=read('./project-design-actions.ts');
 const styles=read('./project-v2.css');
 expect(forms).toContain('Floor Plan Preparation');
 expect(forms).toContain('ProjectDrawingForm');
 expect(forms).toContain("first?.status==='approved'");
 expect(forms).toContain("const allApproved=required.every");
 expect(forms).toContain("if(stage==='client_approved')");
 expect(forms).toContain("submitProjectDrawing(id,form)");
 expect(ui).toContain("agreementSigned={signed}");
 expect(ui).toContain('This agreement was prepared from an earlier quotation');
 expect(drawing).toContain("p_action:'design_submit'");
 expect(drawing).toContain("p_category:'design'");
 expect(drawing).toContain('if(uploaded)revalidatePath');
 expect(styles).toContain('.pv2-project-header-actions{min-width:0;max-width:100%;flex-wrap:wrap');
 expect(ui).not.toContain('>All projects</Link>');
});

it('keeps project edit and sharing inline and shows one evidence-backed next action',()=>{
 const finance=read('./project-next-actions.ts');
 const nextForms=read('./project-next-forms.tsx');
 const drawing=read('./project-design-actions.ts');
 expect(ui).toContain('ProjectStageWorkflow d={d} code={stage.template_code}');
 expect(ui).toContain('Edit project</summary>');
 expect(ui).toContain('Share with client</summary>');
 expect(ui).toContain('<ProjectClientAccess projectId={p.id} customerId={p.customerId}/>');
 expect(ui).not.toContain('href={cur(p.id,\'overview\')+\'#project-settings\'}');
 expect(ui).toContain("!inspection&&canSurvey");
 expect(ui).toContain("inspection&&!measured&&canSurvey");
 expect(ui).toContain('<h3>Site inspection & measurements</h3>');
 expect(ui).toContain("invoice.invoiceTotal>0&&due===0");
 expect(finance).toContain("'project_preflight_save'");
 expect(finance).toContain("'project_advance_proforma_prepare'");
 expect(nextForms).toContain('Issue advance proforma');
 expect(drawing).toContain("readiness.inspection_done!==true||readiness.measurements_done!==true");
 expect(loader).toContain("'project_preflight_read'");
 expect(loader).toContain("'project_advance_read'");
});

it('renders exactly one action location per agreement and design workflow',()=>{
 const block=ui.slice(ui.indexOf('function ProjectStageBoard('),ui.indexOf('function ProjectCommandSidebar('));
 expect(block).toContain('<ProjectStageWorkflow d={d} code={stage.template_code}/>');
 expect(ui).not.toContain('<ProjectPriority d={d}/>');
 expect(ui).not.toContain('<ProjectLifecycle id={d.project.id}\n    stage={d.site.stage}');
 expect(ui).not.toContain('＋ Upload drawing and submit revision');
 expect(ui).toContain('effectiveProjectStageStatus(stage,evidence)');
});
