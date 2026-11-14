import { expectSource } from './source-test-assertions';
import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

describe('mobile project flow navigation', () => {
  it('combines timeline and milestones and wraps mobile tabs', () => {
    const view = read('./project-v2-view.tsx');
    const tabs = view.slice(
      view.indexOf('export const projectPages'),
      view.indexOf('export type ProjectPageSlug'),
    );
    const timeline = view.slice(
      view.indexOf('function Timeline('),
      view.indexOf('function ProjectMilestoneSection('),
    );
    expectSource(tabs).toContain("slug: 'milestones'");
    expectSource(tabs).toContain('tab: false');
    expectSource(view).toContain('milestones: Timeline');
    expectSource(timeline).toContain('<ProjectFlow d={d} />');
    expectSource(timeline).toContain('<ProjectMilestoneSection d={d} />');
    const styles = read('./project-daily-command.css');
    expectSource(styles).toContain(
      'grid-template-columns:repeat(4,minmax(0,1fr))',
    );
    expectSource(styles).toContain('white-space:normal');
  });
});
