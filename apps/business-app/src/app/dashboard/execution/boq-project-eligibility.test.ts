import { describe, expect, it } from 'vitest';
import { projectsReadyForNewBoq } from './boq-project-eligibility';

const projects = [
  { id: 'p1', name: 'First' },
  { id: 'p2', name: 'Second' },
  { id: 'p3', name: 'Third' },
  { id: 'p4', name: 'Fourth' },
];

describe('BOQ new-project eligibility', () => {
  it('shows only projects with an explicitly selected Final quote and no BOQ', () => {
    const result = projectsReadyForNewBoq(
      projects,
      [
        { projectId: 'p1', isFinal: true },
        { projectId: 'p2', isFinal: true },
        { projectId: 'p3', isFinal: false },
      ],
      [{ project_id: 'p1' }],
    );
    expect(result.map((project) => project.id)).toEqual(['p2']);
    expect(result[0]?.name).toBe('Second');
  });

  it('keeps a project hidden if it already has any saved BOQ, regardless of Final revisions', () => {
    expect(
      projectsReadyForNewBoq(
        projects,
        [
          { projectId: 'p1', isFinal: true },
          { projectId: 'p1', isFinal: true },
        ],
        [{ project_id: 'p1' }],
      ),
    ).toEqual([]);
  });

  it('ignores unlinked historic BOQs when finding eligible new projects', () => {
    expect(
      projectsReadyForNewBoq(
        projects.slice(0, 1),
        [{ projectId: 'p1', isFinal: true }],
        [{ project_id: null }],
      ),
    ).toEqual([projects[0]]);
  });
});
