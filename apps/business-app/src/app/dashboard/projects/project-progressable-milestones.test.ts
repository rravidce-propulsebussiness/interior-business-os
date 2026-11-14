import { expectSource } from './source-test-assertions';
import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

describe('progressable quotation-linked milestones', () => {
  const view = read('./project-v2-view.tsx');
  const workItem = read('./project-work-item-card.tsx');
  const flow = read('./project-flow.ts');
  const actions = read('./[id]/site/work-item-actions.ts');
  const checklist = read('./project-stage-checklist-item.tsx');
  const reviewActions = read('./project-stage-review-actions.tsx');
  const onsiteQc = read('./project-onsite-qc-review.tsx');
  const onsiteQcAction = read('./[id]/site/onsite-qc-actions.ts');
  const rccGroups = read('./project-rcc-substage-groups.tsx');
  const rccOpenButton = read('./project-rcc-open-work-button.tsx');

  it('shows the final-quotation preparation action in project setup', () => {
    const milestones = view.slice(
      view.indexOf('function ProjectMilestoneSection('),
      view.indexOf('function Documents('),
    );
    expectSource(milestones).toContain('Make this project plan actionable');
    expectSource(milestones).toContain('const quote=d.quotations[0]');
    expectSource(milestones).toContain(
      'quote&&d.permissions.manage&&d.permissions.finance&&!d.agreement',
    );
    expectSource(milestones).toContain('<PrepareAgreement');
    expectSource(milestones).toContain('upload an offline');
  });

  it('replaces the read-only quote preview with existing live work controls', () => {
    const milestones = view.slice(
      view.indexOf('function ProjectMilestoneSection('),
      view.indexOf('function Documents('),
    );
    expectSource(milestones).toContain('const hasLiveStages=d.stages.length>0');
    expectSource(milestones).toContain('{hasLiveStages&&(');
    expectSource(milestones).toContain('<ProjectWorkHub d={d} showHistory/>');
    expectSource(milestones).toContain('<ProjectTimelineFeed d={d}/>');
    expectSource(workItem).toContain("send('start')");
    expectSource(workItem).toContain("submitForm('complete')");
    expectSource(workItem).toContain('router.refresh()');
    expectSource(actions).toContain("action === 'complete'");
  });

  it('shows milestone progress, today work, evidence, owner skip and separate QC', () => {
    expectSource(view).toContain('pv2-stage-progress');
    expectSource(view).toContain('pv2-stage-qc-card');
    expectSource(view).toContain('Site QC milestone');
    expectSource(view).toContain("aria-label={stage.title + ' QC progress'}");
    expectSource(view).toContain('qcPending>0?`${qcPending} pending`');
    expectSource(view).toContain('qcFailed>0?`${qcFailed} failed`');
    expectSource(view).toContain('workSchedule.plannedFinish>=todayInIndia');
    expectSource(view).toContain('<WorkItemCard');
    expectSource(view).toContain('measurementPrompts(projected.title)');
    expectSource(view).toContain(
      'projectedWork.filter(item=>item.stage.id===stage.id&&item.optional)',
    );
    expectSource(view).toContain('scheduledToday={scheduledToday}');
    expectSource(view).toContain('<StageOnsiteQcReview');
    expectSource(view).toContain('remainingQc.length>0');
    expectSource(checklist).toContain(
      'accept="image/jpeg,image/png,image/webp"',
    );
    expectSource(checklist).toContain('Mark not applicable');
    expectSource(checklist).toContain('updateWorkItem');
    expectSource(checklist).toContain('Skipped with reason:');
    expectSource(workItem).toContain('Mark work complete');
    expectSource(workItem).toContain('Mark complete with photo');
    expectSource(workItem).toContain('Measurements and checks');
    expectSource(workItem).toContain(
      'QC checks and structural certification are never skipped.',
    );
    expectSource(workItem).toContain('Today</span>');
    expectSource(flow).toContain("{ label: 'Depth', unit: 'mm' }");
    expectSource(flow).toContain("{ label: 'Width', unit: 'mm' }");
    const styles = read('./project-v2.css');
    expectSource(styles).toContain('.pv2-stage-qc-card.is-complete');
    expectSource(styles).toContain('.pv2-stage-qc-card.has-fail');
  });

  it('opens the selected site check or QC item with evidence controls', () => {
    expectSource(view).toContain('<ProjectStageReviewActions');
    expectSource(view).toContain("'pv2-stage-check-' + stage.id + '-' + i");
    expectSource(view).toContain(
      "'pv2-stage-qc-' + stage.id + '-' + step.index",
    );
    expectSource(checklist).toContain('required to pass');
    expectSource(reviewActions).toContain('target.scrollIntoView');
    expectSource(reviewActions).toContain('details.pv2-item-checklist');
    expectSource(reviewActions).toContain('details.pv2-on-site-qc');
    expectSource(reviewActions).toContain('details.pv2-qc-item');
    expectSource(reviewActions).toContain('Site checks');
    expectSource(reviewActions).toContain('Company QC');
    expectSource(onsiteQc).toContain('Site inspection photograph');
    expectSource(onsiteQcAction).toContain(
      'QC Pass and Fail both require project photo evidence.',
    );
  });

  it('shows dated RCC work and three expandable work areas in milestones', () => {
    expectSource(view).toContain('<RccDailyPlan');
    expectSource(view).toContain('<RccSubstageGroups');
    expectSource(view).toContain("stage.template_code === 'RCC'");
    expectSource(rccGroups).toContain("title: 'Columns'");
    expectSource(rccGroups).toContain("title: 'Staircase'");
    expectSource(rccGroups).toContain("title: 'Slab & beams'");
    expectSource(rccGroups).toContain("label: 'Today'");
    expectSource(rccGroups).toContain("label: 'Tomorrow'");
    expectSource(rccGroups).toContain("return 'Delayed'");
    expectSource(rccGroups).not.toContain("'use client'");
    expectSource(rccGroups).toContain(
      '<OpenRccWorkButton targetId={row.id} />',
    );
    expectSource(rccOpenButton).toContain("'use client'");
    expectSource(rccOpenButton).toContain('target.scrollIntoView');
  });
});
