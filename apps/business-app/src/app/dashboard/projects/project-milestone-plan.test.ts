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
    const journey = read('./project-flow-view.tsx');
    expectSource(forms).toContain(
      'existing WhatsApp / offline share reference',
    );
    expectSource(forms).toContain('does not record homeowner approval');
    expectSource(forms).toContain(
      "['architectural_plan','3d_design','structural_design','interior_layout','electrical_plan','plumbing_plan']",
    );
    expectSource(journey).toContain(
      "['structural_design', '3d_design', 'electrical_plan', 'plumbing_plan']",
    );
    expectSource(journey).toContain('Waits for previous design approval');
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

  it('gates structural, elevation and MEP submissions on the preceding approved design', () => {
    const migration = read(
      '../../../../../../packages/database/supabase/migrations/20261113115420_project_design_sequence_and_mep_gate.sql',
    );
    expectSource(migration).toContain(
      "when '3d_design' then 'structural_design'",
    );
    expectSource(migration).toContain(
      "when 'electrical_plan' then '3d_design'",
    );
    expectSource(migration).toContain("when 'plumbing_plan' then '3d_design'");
    expectSource(migration).toContain(
      "'electrical_plan','plumbing_plan']::text[]",
    );
  });

  it('shows one slideable stage at a time and selects today’s stage first', () => {
    const timeline = read('./project-milestone-timeline.tsx');
    const carousel = read('./project-milestone-stage-carousel.tsx');
    const styles = read('./project-milestone-timeline.css');
    expectSource(timeline).toContain(
      'const todayStageIndex = stages.findIndex',
    );
    expectSource(timeline).toContain(
      'todayItems.some((item) => item.stage.id === stage.id)',
    );
    expectSource(timeline).toContain(
      'const firstStageIndex = todayStageIndex >= 0',
    );
    expectSource(timeline).toContain('<ProjectMilestoneStageCarousel');
    expectSource(timeline).toContain('open={index === firstStageIndex}');
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
});
