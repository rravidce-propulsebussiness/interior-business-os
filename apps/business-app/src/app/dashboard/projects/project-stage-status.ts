/** Only display evidence-backed progress for quotation/preconstruction stages.
 * Never rewrite work approvals, tests, invoices or stage records.
 */
export type ProjectStageEvidence = {
 approvedQuotation:boolean;
 agreementPrepared:boolean;
 inspectionDone:boolean;
 measurementsDone:boolean;
 designRevisionStarted:boolean;
 designClientApproved:boolean;
};
export function effectiveProjectStageStatus(
 stage:{template_code:string;status:string},
 evidence:ProjectStageEvidence,
):string{
 const stored=stage.status||'not_started';
 // Explicit execution statuses always win over derived presentation.
 if(stored!=='not_started')return stored;
 if(stage.template_code==='QUOTED_SCOPE'&&evidence.approvedQuotation)return 'completed';
 if(stage.template_code==='PRECONSTRUCTION'&&evidence.agreementPrepared)return 'in_progress';
 if(stage.template_code==='SITE_SURVEY'){
  if(evidence.inspectionDone&&evidence.measurementsDone)return 'completed';
  if(evidence.inspectionDone||evidence.measurementsDone)return 'in_progress';
 }
 if(['DESIGN','DESIGN_APPROVAL'].includes(stage.template_code)){
  if(evidence.designClientApproved)return 'completed';
  if(evidence.designRevisionStarted)return 'in_progress';
 }
 return stored;
}
