import {describe,it,expect} from 'vitest';
import {effectiveProjectStageStatus,type ProjectStageEvidence} from './project-stage-status';
const baseline:ProjectStageEvidence={
 approvedQuotation:false,quotedScopeImported:false,agreementPrepared:false,agreementSigned:false,inspectionDone:false,
 measurementsDone:false,designRevisionStarted:false,designClientApproved:false,
};
const status=(code:string,changes:Partial<ProjectStageEvidence>={},stored='not_started')=>
 effectiveProjectStageStatus({template_code:code,status:stored},{...baseline,...changes});
describe('quote-derived project stage status',()=>{
 it('does not claim an unsent quotation was approved',()=>{
  expect(status('QUOTED_SCOPE')).toBe('not_started');
 });
 it('marks approved quotation scope complete without certifying any site work',()=>{
  expect(status('QUOTED_SCOPE',{approvedQuotation:true})).toBe('completed');
  expect(status('FOUNDATION',{approvedQuotation:true})).toBe('not_started');
 });
 it('recognizes a contracted quoted-scope snapshot even when quotation lookup is missing',()=>{
  expect(status('QUOTED_SCOPE',{quotedScopeImported:true})).toBe('completed');
  expect(status('FOUNDATION',{quotedScopeImported:true})).toBe('not_started');
  expect(status('PRECONSTRUCTION',{quotedScopeImported:true})).toBe('not_started');
 });
 it('does not show a prepared agreement as not started',()=>{
  expect(status('PRECONSTRUCTION',{agreementPrepared:true})).toBe('in_progress');
 });
 it('shows completed preconstruction handoff after the signed agreement, survey and design start',()=>{
  const handoff={agreementPrepared:true,agreementSigned:true,inspectionDone:true,measurementsDone:true,designRevisionStarted:true};
  expect(status('PRECONSTRUCTION',handoff)).toBe('completed');
  expect(status('PRECONSTRUCTION',handoff,'in_progress')).toBe('completed');
  expect(status('PRECONSTRUCTION',handoff,'blocked')).toBe('blocked');
  expect(status('PRECONSTRUCTION',{...handoff,agreementSigned:false})).toBe('in_progress');
  expect(status('PRECONSTRUCTION',{...handoff,measurementsDone:false})).toBe('in_progress');
  expect(status('PRECONSTRUCTION',{...handoff,designRevisionStarted:false})).toBe('in_progress');
  expect(status('FOUNDATION',handoff)).toBe('not_started');
 });
 it('requires recorded site evidence for a completed survey',()=>{
  expect(status('SITE_SURVEY',{inspectionDone:true})).toBe('in_progress');
  expect(status('SITE_SURVEY',{inspectionDone:true,measurementsDone:true})).toBe('completed');
 });
 it('reflects design revisions and final client approval',()=>{
  expect(status('DESIGN',{designRevisionStarted:true})).toBe('in_progress');
  expect(status('DESIGN',{designClientApproved:true})).toBe('completed');
  expect(status('DESIGN_APPROVAL',{designRevisionStarted:true})).toBe('in_progress');
 });
 it('preserves manually recorded stage states',()=>{
  expect(status('QUOTED_SCOPE',{approvedQuotation:true},'blocked')).toBe('blocked');
  expect(status('DESIGN',{designClientApproved:true},'completed')).toBe('completed');
 });
});
