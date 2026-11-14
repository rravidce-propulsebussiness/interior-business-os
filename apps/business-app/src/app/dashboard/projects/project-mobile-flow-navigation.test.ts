import { expectSource } from './source-test-assertions';
import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

describe('mobile project milestone navigation', () => {
  it('uses Milestones for the combined flow and wraps mobile tabs', () => {
    const view = read('./project-v2-view.tsx');
    const tabs = view.slice(
      view.indexOf('export const projectPages'),
      view.indexOf('export type ProjectPageSlug'),
    );
    const primaryFlow = view.slice(
      view.indexOf('function Milestones('),
      view.indexOf('function ProjectMilestoneSection('),
    );
    expectSource(tabs).toContain("slug: 'milestones',title: 'Milestones'");
    expectSource(tabs).toContain("slug: 'timeline'");
    expectSource(tabs).toContain('tab: false');
    expectSource(view).toContain('timeline: Milestones');
    expectSource(view).toContain('milestones: Milestones');
    expectSource(primaryFlow).toContain('<ProjectFlow d={d} />');
    expectSource(primaryFlow).toContain('<ProjectMilestoneSection d={d} />');
    expectSource(view).toContain('<h2>Project milestones</h2>');
    expectSource(view).toContain('Planned: {stagePlan.count} item');
    expectSource(view).toContain('plan.plannedFinish < todayInIndia');
    expectSource(view).toContain(
      "value={delayedWork ? 'delayed' : displayStatus}",
    );
    const styles = read('./project-daily-command.css');
    expectSource(styles).toContain(
      'grid-template-columns:repeat(4,minmax(0,1fr))',
    );
    expectSource(styles).toContain('white-space:normal');
  });
});
