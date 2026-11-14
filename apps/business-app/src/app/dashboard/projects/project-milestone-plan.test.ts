import { expectSource } from './source-test-assertions';
import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (name: string) =>
  readFileSync(new URL(name, import.meta.url), 'utf8');

describe('single project milestones and drawing progress', () => {
  it('keeps quote-linked progress on the direct Projects route', () => {
    const nav = read('../owner-workspace-navigation.ts');
    expectSource(nav).toContain("label: 'Projects'");
    expectSource(nav).toContain("href: '/dashboard/projects'");
    expectSource(nav).not.toContain("label: 'All Projects'");
  });

  it('records externally shared plans as references and keeps approvals separate', () => {
    const forms = read('./project-v2-forms.tsx');
    const journey = read('./project-design-stage-workflow.tsx');
    expectSource(forms).toContain(
      'existing WhatsApp / offline share reference',
    );
    expectSource(forms).toContain('does not record homeowner approval');
    expectSource(forms).toContain(
      "['architectural_plan','3d_design','structural_design','interior_layout','electrical_plan','plumbing_plan']",
    );
    expectSource(journey).toContain(
      "'structural_design',\n    'electrical_plan',\n    'plumbing_plan'",
    );
    expectSource(journey).toContain('Each current revision needs technical review');
    const drawingAction = read('./project-design-actions.ts');
    expectSource(drawingAction).not.toContain("'project_preflight_read'");
  });

  it('retains existing payment groups and shows only agreement-based duration guidance', () => {
    const projection = read('./project-quote-milestone-projection.ts');
    const flow = read('./project-quote-payment-flow.tsx');
    expectSource(projection).toContain("'2–4 days'");
    expectSource(projection).toContain("'15–20 days'");
    expectSource(projection).toContain("'40–70 days'");
    expectSource(projection).toContain("'20–30 days'");
    expectSource(flow).toContain('Reference: ' + "' + payment.durationHint");
    expectSource(flow).toContain(
      'No payment schedule or quotation is changed here',
    );
  });

  it('gates structural and MEP submissions on the preceding owner-approved plan', () => {
    const migration = read(
      '../../../../../../packages/database/supabase/migrations/20261114190000_design_stage_floorplan_structural_mep_order.sql',
    );
    expectSource(migration).toContain(
      "WHEN 'structural_design' THEN private.project_floor_plan_kind",
    );
    expectSource(migration).toContain(
      "WHEN 'electrical_plan' THEN 'structural_design'",
    );
    expectSource(migration).toContain("WHEN 'plumbing_plan' THEN 'electrical_plan'");
    expectSource(migration).toContain(
      "'electrical_plan','plumbing_plan']::text[]",
    );
    expectSource(migration).toContain('owner_approved_at IS NULL');
  });

  it('shows one slideable stage at a time and selects today’s stage first', () => {
    const timeline = read('./project-milestone-timeline.tsx');
    const carousel = read('./project-milestone-stage-carousel.tsx');
    const styles = read('./project-milestone-timeline.css');
    expectSource(timeline).toContain(
      'const todayStageIndex = timelineCards.findIndex',
    );
    expectSource(timeline).toContain(
      'todayItems.some((item) => item.stage.id === stage.id)',
    );
    expectSource(timeline).toContain(
      'const firstStageIndex = todayStageIndex >= 0',
    );
    expectSource(timeline).toContain('<ProjectMilestoneStageCarousel');
    expectSource(timeline).toContain(
      'open={cardIndex === firstStageIndex}',
    );
    expectSource(styles).toContain('grid-auto-flow:column');
    expectSource(styles).toContain('scroll-snap-type:x mandatory');
    expectSource(carousel).toContain(
      'aria-label="Swipe through project stages"',
    );
    expectSource(carousel).toContain('aria-label="Previous stage"');
    expectSource(carousel).toContain('aria-label="Next stage"');
  });

  it('keeps the three expandable structural work areas inside the RCC stage', () => {
    const timeline = read('./project-milestone-timeline.tsx');
    const groups = read('./project-rcc-substage-groups.tsx');
    expectSource(timeline).toContain('<RccSubstageGroups');
    expectSource(groups).toContain("title: 'Columns'");
    expectSource(groups).toContain("title: 'Staircase'");
    expectSource(groups).toContain("title: 'Slab & beams'");
    expectSource(groups).toContain('<details');
    expectSource(groups).toContain(
      'No work items are assigned to this area yet.',
    );
  });

  it('groups agreement, plans, and site preparation under one Design stage with no QC card', () => {
    const timeline = read('./project-milestone-timeline.tsx');
    const workflow = read('./project-design-stage-workflow.tsx');
    expectSource(timeline).toContain(
      "const DESIGN_STAGE_CODES = ['PRECONSTRUCTION', 'DESIGN', 'SITE_PREP']",
    );
    expectSource(timeline).toContain("title: 'Design stage'");
    expectSource(timeline).toContain(
      "PRECONSTRUCTION: 'Design payment & agreement'",
    );
    expectSource(timeline).toContain("DESIGN: 'Plans'");
    expectSource(timeline).toContain(
      "SITE_PREP: 'Site marking, excavation & soil test'",
    );
    expectSource(timeline).toContain(
      '<ProjectDesignPaymentAndAgreement data={d}/>',
    );
    expectSource(timeline).toContain('<ProjectDesignPlansWorkflow data={d}/>');
    expectSource(timeline).toContain('!DESIGN_STAGE_CODES.includes(code)');
    expectSource(workflow).toContain("'structural_design'");
    expectSource(workflow).toContain("'electrical_plan'");
    expectSource(workflow).toContain("'plumbing_plan'");
    expectSource(workflow).toContain('<DesignDecisionForm');
    expectSource(workflow).toContain('Release approved plans for site marking');
    expectSource(workflow).toContain('enter the meeting, call, or message reference');
    expectSource(timeline).toContain('action="mark_complete"');
    expectSource(timeline).toContain('!DESIGN_STAGE_CODES.includes(code)');
    const completion = read(
      '../../../../../../packages/database/supabase/migrations/20261114193000_site_prep_completion_without_qc.sql',
    );
    expectSource(completion).toContain("status IN ('in_progress', 'on_hold', 'ready_for_qc', 'completed')");
    expectSource(completion).toContain("v_stage.template_code <> 'SITE_PREP'");
    expectSource(completion).toContain('site_preparation_completed');
  });
});
