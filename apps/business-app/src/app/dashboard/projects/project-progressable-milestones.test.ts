import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

describe('progressable quotation-linked milestones', () => {
  const view = read('./project-v2-view.tsx');
  const workItem = read('./project-work-item-card.tsx');
  const actions = read('./[id]/site/work-item-actions.ts');

  it('shows the final-quotation preparation action on the Milestones page', () => {
    const milestones = view.slice(
      view.indexOf('function Milestones('),
      view.indexOf('function Documents('),
    );
    expect(milestones).toContain('Make this project plan actionable');
    expect(milestones).toContain("quote?.status==='issued'");
    expect(milestones).toContain('d.permissions.manage&&d.permissions.finance');
    expect(milestones).toContain('<PrepareAgreement');
    expect(milestones).toContain('upload an offline agreement');
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
});
