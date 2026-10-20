/** Only display evidence-backed progress for quotation/preconstruction stages.
 * Never rewrite work approvals, tests, invoices or stage records.
 */
export type ProjectStageEvidence = {
 approvedQuotation:boolean;
 quotedScopeImported:boolean;
 agreementPrepared:boolean;
 agreementSigned:boolean;
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
 // Display the completed *design handoff*, without bypassing unpaid advances,
 // payment schedules or physical construction readiness gates.
 // Honor explicit blocked/hold states and final recorded stage states.
 if(stage.template_code==='PRECONSTRUCTION'&&
   ['not_started','in_progress'].includes(stored)&&
   evidence.agreementSigned&&evidence.inspectionDone&&evidence.measurementsDone&&
   (evidence.designRevisionStarted||evidence.designClientApproved))return 'completed';
 // Explicit execution statuses always win over other derived presentation.
 if(stored!=='not_started')return stored;
 // QUOTED_SCOPE can only be imported from a verified contracted quotation.
 // It is a scope snapshot, not physical work. The quote lookup can be empty
 // for converted-lead projects or staff lacking quotation permissions.
 if(stage.template_code==='QUOTED_SCOPE'&&
   (evidence.approvedQuotation||evidence.quotedScopeImported))return 'completed';
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
