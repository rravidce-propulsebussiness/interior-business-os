import { savedMilestoneFlow } from '@business-os/core/quotation-milestone-flow';
import { defaultStageRequirements, savedStageRequirements } from '@business-os/core/quotation-stage-requirements';

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
  steps: QuotedTimelineStep[];
};

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
    steps: (flow[String(paymentIndex)] ?? []).flatMap((step) => {
      // Only work explicitly saved inside THIS payment is rendered.
      if (!payment.stageCodes.includes(step.code)) return [];
      const stage = requirements[step.code] ?? defaultStageRequirements(step.code);
      const field = step.kind === 'work'
        ? stage.work
        : step.kind === 'material'
          ? stage.materials
          : stage.checks;
      const title = field[step.index];
      return title ? [{ ...step, title }] : [];
    }),
  }));
}
