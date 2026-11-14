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
    expectSource(primaryFlow).toContain('<ProjectFlow d={d} milestoneMode />');
    expectSource(primaryFlow).not.toContain('<ProjectMilestoneSection');
    expectSource(read('./project-milestone-timeline.tsx')).toContain('<h1>Project milestones</h1>');
    expectSource(read('./project-milestone-timeline.tsx')).toContain('Delayed ');
    const styles = read('./project-daily-command.css');
    expectSource(styles).toContain(
      'grid-template-columns:repeat(4,minmax(0,1fr))',
    );
    expectSource(styles).toContain('white-space:normal');
  });
});
