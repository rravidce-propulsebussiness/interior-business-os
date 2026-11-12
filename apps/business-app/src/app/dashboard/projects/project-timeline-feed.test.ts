import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { projectTimelineFeed } from './project-timeline-feed';
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const stage = (id: string, sequence: number, floor_code: string | null = null) => ({
  id, sequence, floor_code, template_code: 'RCC', title: id, status: 'not_started',
  phase: 'execution', explanation: '', activities: ['Slab', 'Masonry'], task_count: 2,
  instance_code: id, dependencies: [], inspectionTopics: [],
});

it('routes All Projects selections into the single timeline-first project workspace', () => {
  const projectEntry = read('./[id]/page.tsx');
  const screen = read('./project-v2-view.tsx');
  const navigation = read('../owner-workspace-navigation.ts');
  expect(projectEntry).toContain('view="timeline"');
  expect(screen).toContain('function ProjectTimelineFeed');
  expect(screen).toContain('<ProjectDailyCommand d=');
  expect(navigation).toContain("label: 'All Projects'");
});
const plan = (stageId: string, index: number, plannedStart: string, kind: 'work' | 'check' = 'work') => ({
  stageId, index, kind, title: kind === 'work' ? `Work ${index}` : `Check ${index}`,
  plannedStart, plannedFinish: plannedStart, note: '', version: 1,
});

describe('single project chronological feed', () => {
  it('sorts concurrent floor activities by their planned date without a stage cursor', () => {
    const feed = projectTimelineFeed({
      stages: [stage('third-floor', 3, 'third'), stage('first-floor', 1, 'first')],
      plans: [plan('third-floor', 0, '2026-11-15'), plan('first-floor', 1, '2026-11-15'),
        plan('first-floor', 0, '2026-11-14')],
      work: [], checks: [], execution: [],
    });
    expect(feed.map(row => [row.plan.plannedStart, row.stage.id, row.plan.index])).toEqual([
      ['2026-11-14', 'first-floor', 0], ['2026-11-15', 'first-floor', 1],
      ['2026-11-15', 'third-floor', 0],
    ]);
  });

  it('shows recorded item state and structural blockers from canonical execution rows', () => {
    const feed = projectTimelineFeed({
      stages: [stage('foundation', 1)], plans: [plan('foundation', 0, '2026-11-14')],
      work: [{ stage_id: 'foundation', index: 0, status: 'completed' }], checks: [],
      execution: [{ stageId: 'foundation', status: 'on_hold', blockers: ['Structural sign-off required'],
        startedAt: null, fieldFinishedAt: null }],
    });
    expect(feed[0]?.status).toBe('completed');
    expect(feed[0]?.blockers).toEqual(['Structural sign-off required']);
  });

  it('does not invent rows for unknown stages or undated work', () => {
    const feed = projectTimelineFeed({
      stages: [stage('foundation', 1)],
      plans: [plan('missing', 0, '2026-11-14'), { ...plan('foundation', 1, ''), plannedFinish: '' }],
      work: [], checks: [], execution: [],
    });
    expect(feed).toEqual([]);
  });
});
