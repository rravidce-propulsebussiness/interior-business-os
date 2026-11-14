import { savedMilestoneFlow } from '@business-os/core/quotation-milestone-flow';
import {
  defaultStageRequirements,
  savedStageRequirements,
} from '@business-os/core/quotation-stage-requirements';

/** The quote owns the payment rows and their ordered work references.
 * This is a read-only projection for the project timeline, never a new
 * schedule, a payment request, or a separate execution workflow. */
export type QuotedTimelineStep = {
  kind: 'work' | 'material' | 'check' | 'test' | 'qc';
  code: string;
  index: number;
  title: string;
};
export type QuotedTimelineMilestone = {
  name: string;
  percent: number;
  stageCodes: string[];
  durationHint: string;
  steps: QuotedTimelineStep[];
};

/** Execution records own physical stage progress; legacy stage snapshots
 * can remain not_started after field work has been submitted for QC. */
export function quotedStageStatus(
  stage: { id: string; status: string },
  execution: readonly { stageId: string; status: string }[],
): string {
  return (
    execution.find((row) => row.stageId === stage.id)?.status ||
    stage.status ||
    'not_started'
  );
}

/** Reference ranges transcribed from the uploaded SG Homes agreement's
 * schedule. They guide planning only; the project's quotation remains the
 * source of its actual payment terms and the site log records actual dates. */
function referenceDuration(
  name: string,
  stageCodes: readonly string[],
): string {
  const text = name.toLowerCase();
  if (
    /material dump|material deliver|material.*brick|material.*tile/.test(text)
  )
    return '2–4 days';
  if (/brickwork|door frame|conduiting/.test(text)) return '40–70 days';
  if (/plaster|sajja|shelves/.test(text)) return '20–30 days';
  if (/site inspection|design|clearing|excavat/.test(text)) return '15–20 days';
  if (/pcc|footing|column|plinth|sump|morram|slab/.test(text))
    return '15–20 days';
  if (
    /tile|granite|paint|door|window|railing|grill|finish|handover|putty|wiring/.test(
      text,
    )
  )
    return '15–20 days';
  if (
    stageCodes.some((code) =>
      /^(SITE_PREP|FOUNDATION|PLINTH|RCC)(\/|$)/.test(code),
    )
  )
    return '15–20 days';
  if (stageCodes.some((code) => /^(MASONRY)(\/|$)/.test(code)))
    return '40–70 days';
  if (
    stageCodes.some((code) =>
      /^(INTERNAL_PLASTER|EXTERNAL_PLASTER)(\/|$)/.test(code),
    )
  )
    return '20–30 days';
  return '';
}

export function quoteMilestoneProjection(
  savedTerms: string,
  payments: readonly { name: string; percent: number; stageCodes: string[] }[],
): QuotedTimelineMilestone[] {
  // Keep every existing payment in the same position and at its saved share.
  // Missing/legacy workflow steps do not authorize inventing new work.
  let flow: ReturnType<typeof savedMilestoneFlow> = {};
  let requirements: ReturnType<typeof savedStageRequirements> = {};
  try {
    flow = savedMilestoneFlow(savedTerms);
    requirements = savedStageRequirements(savedTerms);
  } catch {
    // Retain the saved payment headings even when older workflow metadata
    // cannot be parsed. The site's canonical stages remain accessible.
  }
  return payments.map((payment, paymentIndex) => ({
    name: payment.name,
    percent: payment.percent,
    stageCodes: [...payment.stageCodes],
    durationHint: referenceDuration(payment.name, payment.stageCodes),
    steps: (flow[String(paymentIndex)] ?? []).flatMap((step) => {
      // Only work explicitly saved inside THIS payment is rendered.
      if (!payment.stageCodes.includes(step.code)) return [];
      const stage =
        requirements[step.code] ?? defaultStageRequirements(step.code);
      const field =
        step.kind === 'work'
          ? stage.work
          : step.kind === 'material'
            ? stage.materials
            : stage.checks;
      const title = field[step.index];
      return title ? [{ ...step, title }] : [];
    }),
  }));
}
