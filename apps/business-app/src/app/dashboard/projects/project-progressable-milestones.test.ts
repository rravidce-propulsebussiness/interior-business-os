import { expectSource } from './source-test-assertions';
import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

describe('progressable quotation-linked milestones', () => {
  const timeline = read('./project-milestone-timeline.tsx');
  const designWorkflow = read('./project-design-stage-workflow.tsx');
  const workItem = read('./project-work-item-card.tsx');
  const flow = read('./project-flow.ts');
  const actions = read('./[id]/site/work-item-actions.ts');
  const checklist = read('./project-stage-checklist-item.tsx');
  const flowView = read('./project-flow-view.tsx');
  const onsiteQc = read('./project-onsite-qc-review.tsx');
  const onsiteQcAction = read('./[id]/site/onsite-qc-actions.ts');
  const rccGroups = read('./project-rcc-substage-groups.tsx');
  const rccOpenButton = read('./project-rcc-open-work-button.tsx');

  it('shows agreement preparation in the first Design sub-stage', () => {
    expectSource(timeline).toContain("PRECONSTRUCTION: 'Design payment & agreement'");
    expectSource(timeline).toContain('<ProjectDesignPaymentAndAgreement data={d}/>');
    expectSource(designWorkflow).toContain('<PrepareAgreement');
    expectSource(designWorkflow).toContain('<SkipAgreementUpload');
    expectSource(designWorkflow).toContain('The project owner can prepare the agreement');
  });

  it('shows current work actions inside the selected milestone', () => {
    expectSource(timeline).toContain('<ProjectItemSchedule');
    expectSource(timeline).toContain('<WorkItemCard');
    expectSource(timeline).toContain('<StageButton');
    expectSource(timeline).toContain('<ProjectMilestoneStageCarousel');
    expectSource(flowView).toContain('<ProjectMilestoneTimeline d={d} />');
    expectSource(workItem).toContain("send('start')");
    expectSource(workItem).toContain("submitForm('complete')");
    expectSource(workItem).toContain('router.refresh()');
    expectSource(actions).toContain("action === 'complete'");
  });

  it('shows today work and evidence-backed site checks without QC in Stage 1', () => {
    expectSource(timeline).toContain('pmt-progress');
    expectSource(timeline).toContain('pmt-days');
    expectSource(timeline).toContain('<WorkItemCard');
    expectSource(timeline).toContain('<StageChecklistItem');
    expectSource(timeline).toContain('<StageOnsiteQcReview');
    expectSource(timeline).toContain('!DESIGN_STAGE_CODES.includes(code)');
    expectSource(timeline).toContain("action=\"mark_complete\"");
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
    const styles = read('./project-milestone-timeline.css');
    expectSource(styles).toContain('.pmt-check');
    expectSource(styles).toContain('.pmt-design-substage');
  });

  it('opens the selected site check or QC item with evidence controls', () => {
    expectSource(timeline).toContain('<StageChecklistItem');
    expectSource(timeline).toContain('<StageOnsiteQcReview');
    expectSource(checklist).toContain('required to pass');
    expectSource(onsiteQc).toContain('Site inspection photograph');
    expectSource(onsiteQcAction).toContain(
      'QC Pass and Fail both require project photo evidence.',
    );
  });

  it('shows dated RCC work and three expandable work areas in milestones', () => {
    expectSource(timeline).toContain('<RccSubstageGroups');
    expectSource(timeline).toContain("code === 'RCC'");
    expectSource(timeline).toContain('<ProjectItemSchedule');
    expectSource(rccGroups).toContain("title: 'Columns'");
    expectSource(rccGroups).toContain("title: 'Staircase'");
    expectSource(rccGroups).toContain("title: 'Slab & beams'");
    expectSource(rccGroups).toContain("label: 'Today'");
    expectSource(rccGroups).toContain("label: 'Tomorrow'");
    expectSource(rccGroups).toContain("return 'Delayed'");
    expectSource(rccGroups).toContain(
      "aria-label={stageTitle + ' daily work'}",
    );
    expectSource(rccGroups).not.toContain("'use client'");
    expectSource(rccGroups).toContain(
      '<OpenRccWorkButton targetId={row.id} />',
    );
    expectSource(rccOpenButton).toContain("'use client'");
    expectSource(rccOpenButton).toContain('target.scrollIntoView');
    expectSource(timeline).toContain('Today');
    expectSource(timeline).toContain('Tomorrow');
  });
});
