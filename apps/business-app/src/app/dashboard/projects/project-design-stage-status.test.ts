import { describe, expect, it } from 'vitest';
import type { DesignFlow } from './project-v2-data';
import {
  areRequiredDesignPlansApproved,
  designSubstageDisplayStatus,
} from './project-design-stage-status';

const approvedDesign: DesignFlow = {
  stage: 'design',
  floorPlanKind: 'architectural_plan',
  advanceBeforeDesign: false,
  agreementAuthorized: true,
  decisions: [],
  designs: [
    'architectural_plan',
    'structural_design',
    'electrical_plan',
    'plumbing_plan',
  ].map((kind, index) => ({
    id: String(index),
    kind,
    revision: 1,
    reference: 'offline reference',
    status: 'approved',
    reviewNote: '',
    createdAt: '2026-11-14T00:00:00.000Z',
    clientApprovedAt: '2026-11-14T00:00:00.000Z',
    clientSource: 'offline',
  })),
};

describe('Design stage milestone status', () => {
  it('requires a current, technically approved and owner-approved revision for each plan', () => {
    expect(areRequiredDesignPlansApproved(approvedDesign)).toBe(true);
    expect(areRequiredDesignPlansApproved(null)).toBe(false);
    expect(
      areRequiredDesignPlansApproved({
        ...approvedDesign,
        designs: approvedDesign.designs.map((row) =>
          row.kind === 'structural_design'
            ? { ...row, status: 'submitted', clientApprovedAt: null }
            : row,
        ),
      }),
    ).toBe(false);
  });

  it('shows an authorized agreement and fully approved plans as completed', () => {
    expect(
      designSubstageDisplayStatus({
        code: 'PRECONSTRUCTION',
        storedStatus: 'not_started',
        agreementAuthorized: true,
        design: approvedDesign,
        allWorkComplete: false,
        allChecksComplete: false,
      }),
    ).toBe('completed');
    expect(
      designSubstageDisplayStatus({
        code: 'DESIGN',
        storedStatus: 'not_started',
        agreementAuthorized: true,
        design: approvedDesign,
        allWorkComplete: false,
        allChecksComplete: false,
      }),
    ).toBe('completed');
  });

  it('treats completed Site Prep checks as complete without a QC handoff', () => {
    const input = {
      code: 'SITE_PREP',
      storedStatus: 'ready_for_qc',
      agreementAuthorized: true,
      design: approvedDesign,
      allWorkComplete: true,
      allChecksComplete: true,
    };
    expect(designSubstageDisplayStatus(input)).toBe('completed');
    expect(
      designSubstageDisplayStatus({ ...input, allChecksComplete: false }),
    ).toBe('in_progress');
  });

  it('preserves a blocked or on-hold sub-stage', () => {
    expect(
      designSubstageDisplayStatus({
        code: 'SITE_PREP',
        storedStatus: 'on_hold',
        agreementAuthorized: true,
        design: approvedDesign,
        allWorkComplete: true,
        allChecksComplete: true,
      }),
    ).toBe('on_hold');
  });
});
