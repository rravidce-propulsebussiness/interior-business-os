import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

describe('progressable quotation-linked milestones', () => {
  const view = read('./project-v2-view.tsx');
  const workItem = read('./project-work-item-card.tsx');
  const flow = read('./project-flow.ts');
  const actions = read('./[id]/site/work-item-actions.ts');
  const checklist = read('./project-stage-checklist-item.tsx');

  it('shows the final-quotation preparation action on the Milestones page', () => {
    const milestones = view.slice(
      view.indexOf('function Milestones('),
      view.indexOf('function Documents('),
    );
    expect(milestones).toContain('Make this project plan actionable');
    expect(milestones).toContain('const quote=d.quotations[0]');
    expect(milestones).toContain('quote&&d.permissions.manage&&d.permissions.finance&&!d.agreement');
    expect(milestones).toContain('<PrepareAgreement');
    expect(milestones).toContain('upload an offline');
  });

  it('replaces the read-only quote preview with existing live work controls', () => {
    const milestones = view.slice(
      view.indexOf('function Milestones('),
      view.indexOf('function Documents('),
    );
    expect(milestones).toContain('const hasLiveStages=d.stages.length>0');
    expect(milestones).toContain('{hasLiveStages&&<>');
    expect(milestones).toContain('<ProjectWorkHub d={d} showHistory/>');
    expect(milestones).toContain('<ProjectTimelineFeed d={d}/>');
    expect(milestones).toContain('Continue in Timeline');
    expect(workItem).toContain("send('start')");
    expect(workItem).toContain("submitForm('complete')");
    expect(workItem).toContain('router.refresh()');
    expect(actions).toContain("action === 'complete'");
  });

  it('shows milestone progress, today work, evidence, owner skip and separate QC', () => {
    expect(view).toContain('pv2-stage-progress');
    expect(view).toContain('workSchedule.plannedFinish>=todayInIndia');
    expect(view).toContain('<WorkItemCard');
    expect(view).toContain('measurementPrompts(projected.title)');
    expect(view).toContain('projectedWork.filter(item=>item.stage.id===stage.id&&item.optional)');
    expect(view).toContain('scheduledToday={scheduledToday}');
    expect(view).toContain('<StageOnsiteQcReview');
    expect(view).toContain('remainingQc.length>0');
    expect(checklist).toContain('accept="image/jpeg,image/png,image/webp"');
    expect(checklist).toContain('Mark not applicable');
    expect(checklist).toContain('updateWorkItem');
    expect(checklist).toContain('Skipped with reason:');
    expect(workItem).toContain('Complete with photo');
    expect(workItem).toContain('Measurements and checks');
    expect(workItem).toContain('QC checks and structural certification are never skipped.');
    expect(workItem).toContain('Today</span>');
    expect(flow).toContain("{ label: 'Depth', unit: 'mm' }");
    expect(flow).toContain("{ label: 'Width', unit: 'mm' }");
  });
});
