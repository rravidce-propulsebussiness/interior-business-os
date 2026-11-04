import { describe, expect, it } from 'vitest';
import type { ProjectEntry } from '../projects/project-v2-types';
import {
  portfolioSnapshot,
  projectCategory,
  type PortfolioTask,
} from './portfolio';

function project(
  id: string,
  status: string,
  progress: number | null,
): ProjectEntry {
  return {
    id,
    name: 'Project ' + id,
    code: id,
    status,
    projectType: 'Villa',
    address: 'Hyderabad',
    createdAt: '2026-10-15',
    client: 'Example Client',
    industry: 'Construction',
    progress,
    customerId: null,
  };
}

function task(
  id: string,
  status: string,
  planned_end: string | null,
  project_id = 'p1',
): PortfolioTask {
  return {
    id,
    status,
    planned_end,
    project_id,
    title: 'Task ' + id,
    priority: 'normal',
  };
}

describe('construction project portfolio, based on canonical records', () => {
  it('classifies finished, paused and ongoing projects without inventing progress', () => {
    expect(projectCategory('completed')).toBe('completed');
    expect(projectCategory('handover')).toBe('completed');
    expect(projectCategory('on_hold')).toBe('on_hold');
    expect(projectCategory('active')).toBe('ongoing');
    const summary = portfolioSnapshot(
      [
        project('p1', 'active', 55),
        project('p2', 'completed', null),
        project('p3', 'on_hold', 25),
      ],
      null,
      '2026-11-04',
    );
    expect(summary).toMatchObject({
      total: 3,
      ongoing: 1,
      completed: 1,
      onHold: 1,
      tracked: 2,
      averageProgress: 40,
      blocked: null,
      overdue: null,
      dueSoon: null,
      alerts: null,
    });
  });

  it('prioritizes blocked, overdue and seven-day deadlines from real task rows', () => {
    const summary = portfolioSnapshot(
      [project('p1', 'active', null)],
      [
        task('done', 'done', '2026-11-01'),
        task('blocked', 'blocked', null),
        task('late', 'in_progress', '2026-11-03'),
        task('today', 'todo', '2026-11-04'),
        task('week', 'todo', '2026-11-11'),
        task('future', 'todo', '2026-11-12'),
        task('cancelled', 'cancelled', '2026-11-01'),
      ],
      '2026-11-04',
    );
    expect(summary).toMatchObject({
      blocked: 1,
      overdue: 1,
      dueSoon: 2,
      byProject: { p1: 4 },
    });
    expect(summary.alerts?.map((alert) => alert.id)).toEqual([
      'blocked',
      'late',
      'today',
      'week',
    ]);
  });

  it('keeps unknown progress and permissions unknown, not zero', () => {
    const result = portfolioSnapshot(
      [project('p1', 'active', null)],
      null,
      '2026-11-04',
    );
    expect(result.averageProgress).toBeNull();
    expect(result.alerts).toBeNull();
    expect(result.byProject).toEqual({});
    const empty = portfolioSnapshot([], [], '2026-11-04');
    expect(empty.total).toBe(0);
    expect(empty.alerts).toEqual([]);
    expect(empty.blocked).toBe(0);
  });

  it('rolls deadlines safely across the year boundary', () => {
    const summary = portfolioSnapshot(
      [project('p1', 'active', 0)],
      [task('new-year', 'todo', '2027-01-03')],
      '2026-12-29',
    );
    expect(summary.dueSoon).toBe(1);
    expect(summary.overdue).toBe(0);
  });
});
