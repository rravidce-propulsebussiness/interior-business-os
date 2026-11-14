import type { DesignFlow } from './project-v2-data';

const REQUIRED_PLAN_KINDS = [
  'architectural_plan',
  'structural_design',
  'electrical_plan',
  'plumbing_plan',
] as const;

const COMPLETED_STATUSES = new Set([
  'completed',
  'passed',
  'certified',
  'skipped',
]);

export function areRequiredDesignPlansApproved(
  design: DesignFlow | null | undefined,
): boolean {
  if (!design) return false;

  const requiredKinds = [
    design.floorPlanKind || 'architectural_plan',
    ...REQUIRED_PLAN_KINDS.slice(1),
  ];

  return requiredKinds.every((kind) => {
    const latest = design.designs
      .filter((revision) => revision.kind === kind)
      .reduce<(typeof design.designs)[number] | undefined>(
        (current, revision) =>
          !current || revision.revision > current.revision ? revision : current,
        undefined,
      );
    return latest?.status === 'approved' && Boolean(latest.clientApprovedAt);
  });
}

export function designSubstageDisplayStatus(input: {
  code: string;
  storedStatus: string;
  agreementAuthorized: boolean;
  design: DesignFlow | null | undefined;
  allWorkComplete: boolean;
  allChecksComplete: boolean;
}): string {
  const { code, storedStatus } = input;
  if (['blocked', 'on_hold'].includes(storedStatus)) return storedStatus;

  if (code === 'PRECONSTRUCTION') {
    return input.agreementAuthorized ? 'completed' : storedStatus;
  }

  if (code === 'DESIGN') {
    return areRequiredDesignPlansApproved(input.design)
      ? 'completed'
      : storedStatus;
  }

  if (code === 'SITE_PREP') {
    if (storedStatus === 'completed') return 'completed';
    if (input.allWorkComplete && input.allChecksComplete) return 'completed';
    // Stage 1 has no QC step. Convert its legacy QC queue status to an
    // actionable in-progress state until the owner closes the site work.
    if (storedStatus === 'ready_for_qc') return 'in_progress';
  }

  return storedStatus || 'not_started';
}

export function allStatusesComplete(statuses: string[]): boolean {
  return statuses.length > 0 &&
    statuses.every((status) => COMPLETED_STATUSES.has(status));
}
