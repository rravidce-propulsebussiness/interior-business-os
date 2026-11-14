import type { WorkspaceData } from './project-v2-data';
import { ProjectMilestoneTimeline } from './project-milestone-timeline';

/** Compatibility export for project routes; all project progress uses one timeline. */
export function ProjectFlow({ d }: { d: WorkspaceData; milestoneMode?: boolean }) {
  return <ProjectMilestoneTimeline d={d} />;
}
