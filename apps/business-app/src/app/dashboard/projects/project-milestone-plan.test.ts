import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (name: string) => readFileSync(new URL(name, import.meta.url), 'utf8');

describe('single project milestones and drawing progress', () => {
  it('keeps quote-linked progress on the direct Projects route', () => {
    const nav = read('../owner-workspace-navigation.ts');
    expect(nav).toContain("label: 'Projects'");
    expect(nav).toContain("href: '/dashboard/projects'");
    expect(nav).not.toContain("label: 'All Projects'");
  });

  it('records externally shared plans as references and keeps approvals separate', () => {
    const forms = read('./project-v2-forms.tsx');
    const journey = read('./project-flow-view.tsx');
    expect(forms).toContain('existing WhatsApp / offline share reference');
    expect(forms).toContain('does not record homeowner approval');
    expect(forms).toContain("['architectural_plan','structural_design','3d_design','electrical_plan','plumbing_plan']");
    expect(journey).toContain("['structural_design', '3d_design', 'electrical_plan', 'plumbing_plan']");
    expect(journey).toContain('Waits for previous design approval');
  });

  it('retains existing payment groups and shows only agreement-based duration guidance', () => {
    const projection = read('./project-quote-milestone-projection.ts');
    const flow = read('./project-quote-payment-flow.tsx');
    expect(projection).toContain("'2–4 days'");
    expect(projection).toContain("'15–20 days'");
    expect(projection).toContain("'40–70 days'");
    expect(projection).toContain("'20–30 days'");
    expect(flow).toContain('Reference: ' + "' + payment.durationHint");
    expect(flow).toContain('No payment schedule or quotation is changed here');
  });

  it('gates structural, elevation and MEP submissions on the preceding approved design', () => {
    const migration = read(
      '../../../../../../packages/database/supabase/migrations/20261113115420_project_design_sequence_and_mep_gate.sql',
    );
    expect(migration).toContain("when '3d_design' then 'structural_design'");
    expect(migration).toContain("when 'electrical_plan' then '3d_design'");
    expect(migration).toContain("when 'plumbing_plan' then '3d_design'");
    expect(migration).toContain("'electrical_plan','plumbing_plan']::text[]");
  });
});
