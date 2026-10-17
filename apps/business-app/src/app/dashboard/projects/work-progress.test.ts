import { describe, expect, it } from 'vitest';
import { workCompletionByProject } from './work-progress';

describe('Project weighted work completion', () => {
  it('uses recorded task percentages and weight, not approvals', () => {
    const progress = workCompletionByProject(['p1'], [
      { project_id: 'p1', status: 'done', completion_percentage: '20', weight: '3' },
      { project_id: 'p1', status: 'in_progress', completion_percentage: '50', weight: '1' },
    ]);
    expect(progress.get('p1')).toBe(88);
  });

  it('treats no recorded tasks, blocked data and other projects as untracked', () => {
    expect(workCompletionByProject(['a', 'b'], []).get('a')).toBeNull();
    expect(workCompletionByProject(['a'], null).get('a')).toBeNull();
    expect(workCompletionByProject(['a'], [
      { project_id: 'other', status: 'done', completion_percentage: '100', weight: '1' },
      { project_id: 'a', status: 'in_progress', completion_percentage: '20', weight: '0' },
    ]).get('a')).toBeNull();
  });

  it('clamps invalid percentages and excludes cancelled tasks', () => {
    const progress = workCompletionByProject(['p1'], [
      { project_id: 'p1', status: 'in_progress', completion_percentage: '400', weight: '1' },
      { project_id: 'p1', status: 'cancelled', completion_percentage: '30', weight: '1' },
      { project_id: 'p1', status: 'not_started', completion_percentage: '-10', weight: '1' },
    ]);
    expect(progress.get('p1')).toBe(50);
  });
});
