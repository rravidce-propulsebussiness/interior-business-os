import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  chronologicalGroups,
  flowBuckets,
  flowRole,
  measurementPrompts,
  nextAction,
  parseCuring,
  parseEvents,
  parseOptional,
  projectWorkItems,
  shouldShowAdvancePayment,
  floorName,
} from './project-flow';
import type { Stage, StageExecution, StageItemPlan } from './project-v2-data';

const stage = (
  id: string,
  sequence: number,
  activities: string[],
  floor: string | null = null,
  template = 'SLAB',
): Stage => ({
  id,
  sequence,
  floor_code: floor,
  template_code: template,
  title: id,
  status: 'not_started',
  phase: 'superstructure',
  explanation: '',
  activities,
  task_count: 0,
  instance_code: id,
  dependencies: [],
  inspectionTopics: [],
});
const exec = (
  stageId: string,
  status: string,
  blockers: string[] = [],
): StageExecution => ({
  stageId,
  status,
  blockers,
  startedAt: null,
  fieldFinishedAt: null,
});
const plan = (
  stageId: string,
  index: number,
  start: string,
  finish = start,
): StageItemPlan => ({
  stageId,
  kind: 'work',
  index,
  title: '',
  plannedStart: start,
  plannedFinish: finish,
  note: '',
  version: 1,
});

const stages = [
  stage('DESIGN', 1, ['Prepare drawings'], null, 'DESIGN'),
  stage('F3_SLAB', 5, ['Slab reinforcement', 'Slab concreting'], 'F3'),
  stage('F1_MASONRY', 4, ['First floor brickwork'], 'F1', 'MASONRY'),
  stage('F3_MASONRY', 6, ['Third floor brickwork'], 'F3', 'MASONRY'),
];
const execution = [
  exec('F3_SLAB', 'in_progress'),
  exec('F1_MASONRY', 'in_progress'),
  exec('F3_MASONRY', 'not_started', ['Finish prerequisite: F3_SLAB']),
];

describe('single project flow model', () => {
  it('does not show an advance milestone without a schedule or Finance invoice', () => {
    expect(shouldShowAdvancePayment(null)).toBe(false);
    expect(
      shouldShowAdvancePayment({ invoiceId: null, scheduleActive: false }),
    ).toBe(false);
    expect(
      shouldShowAdvancePayment({ invoiceId: null, scheduleActive: true }),
    ).toBe(true);
    expect(
      shouldShowAdvancePayment({
        invoiceId: 'invoice-1',
        scheduleActive: false,
      }),
    ).toBe(true);
  });

  it('resolves exactly one role per person from canonical site permissions', () => {
    expect(
      flowRole({ canManage: true, siteRole: 'watchman', qcReviewer: false }),
    ).toBe('owner');
    expect(
      flowRole({ canManage: false, siteRole: 'watchman', qcReviewer: false }),
    ).toBe('watchman');
    expect(
      flowRole({
        canManage: false,
        siteRole: 'site_engineer',
        qcReviewer: false,
      }),
    ).toBe('engineer');
    expect(
      flowRole({
        canManage: false,
        siteRole: 'quality_inspector',
        qcReviewer: true,
      }),
    ).toBe('qc');
    expect(flowRole({ canManage: false, siteRole: '', qcReviewer: true })).toBe(
      'qc',
    );
    expect(
      flowRole({ canManage: false, siteRole: 'architect', qcReviewer: false }),
    ).toBe('designer');
  });

  it('builds executable work items only for physical stages, including owner-added optional work', () => {
    const items = projectWorkItems({
      stages,
      execution,
      plans: [],
      work: [
        {
          stage_id: 'F3_SLAB',
          index: 0,
          status: 'completed',
          measurements: [{ label: 'Cover', value: '50', unit: 'mm' }],
        },
      ],
      optional: [
        {
          stageId: 'F1_MASONRY',
          index: 1000,
          title: 'Scaffold inspection',
          reason: 'Owner safety walk',
        },
      ],
    });
    expect(items.map((i) => i.key)).toEqual([
      'F3_SLAB:0',
      'F3_SLAB:1',
      'F1_MASONRY:0',
      'F1_MASONRY:1000',
      'F3_MASONRY:0',
    ]);
    expect(
      items.find((i) => i.key === 'F3_SLAB:0')?.measurements[0]?.value,
    ).toBe('50');
    expect(items.find((i) => i.index === 1000)?.optional).toBe(true);
  });

  it('keeps concurrent floors together today and never activates blocked stages from dates', () => {
    const items = projectWorkItems({
      stages,
      execution,
      optional: [],
      work: [{ stage_id: 'F1_MASONRY', index: 0, status: 'in_progress' }],
      plans: [
        plan('F3_SLAB', 1, '2026-11-13'),
        plan('F3_MASONRY', 0, '2026-11-12'),
      ],
    });
    const b = flowBuckets(items, {
      today: '2026-11-12',
      tomorrow: '2026-11-13',
    });
    expect(b.today.map((i) => i.key).sort()).toEqual([
      'F1_MASONRY:0',
      'F3_SLAB:0',
    ]);
    expect(b.tomorrow.map((i) => i.key)).toEqual(['F3_SLAB:1']);
    expect(b.today.some((i) => i.stage.id === 'F3_MASONRY')).toBe(false);
    expect(b.blocked[0]?.stage.id).toBe('F3_MASONRY');
    expect(b.active.map((s) => s.id).sort()).toEqual(['F1_MASONRY', 'F3_SLAB']);
  });

  it('offers QC submission only when every item is completed or skipped', () => {
    const items = projectWorkItems({
      stages,
      execution,
      optional: [],
      plans: [],
      work: [
        { stage_id: 'F3_SLAB', index: 0, status: 'completed' },
        { stage_id: 'F3_SLAB', index: 1, status: 'skipped' },
      ],
    });
    expect(
      flowBuckets(items, { today: 'x', tomorrow: 'y' }).readyForQc.map(
        (s) => s.id,
      ),
    ).toEqual(['F3_SLAB']);
  });

  it('shows an engineer only unassigned work or work assigned to them', () => {
    const items = projectWorkItems({
      stages,
      execution,
      optional: [],
      plans: [],
      work: [
        { stage_id: 'F3_SLAB', index: 0, assignee_id: 'someone-else' },
        { stage_id: 'F3_SLAB', index: 1, assignee_id: 'me' },
      ],
    });
    const mine = flowBuckets(
      items,
      { today: 'a', tomorrow: 'b' },
      { userId: 'me', owner: false },
    );
    expect(mine.today.map((i) => i.key)).toEqual(['F1_MASONRY:0', 'F3_SLAB:1']);
    const owner = flowBuckets(
      items,
      { today: 'a', tomorrow: 'b' },
      { userId: 'me', owner: true },
    );
    expect(owner.today).toHaveLength(3);
  });

  it('gives one next action per role', () => {
    const items = projectWorkItems({
      stages,
      execution,
      optional: [],
      plans: [],
      work: [{ stage_id: 'F1_MASONRY', index: 0, status: 'in_progress' }],
    });
    const b = flowBuckets(items, { today: 'a', tomorrow: 'b' });
    expect(nextAction('engineer', b, null).title).toBe(
      'Finish: First floor brickwork',
    );
    const curing = parseCuring({
      plans: [],
      rounds: [
        { plan_id: 'p', title: 'Slab curing', round_at: 'x', status: 'due' },
      ],
      missed_total: 2,
    });
    expect(nextAction('watchman', b, curing).title).toBe(
      'Record curing round now',
    );
    expect(nextAction('owner', b, curing).tone).toBe('alert');
    expect(nextAction('qc', b, null).title).toBe('No inspections waiting');
  });

  it('prompts for site measurements without inventing values', () => {
    expect(
      measurementPrompts('Excavation to founding level').map((m) => m.label),
    ).toEqual(['Depth', 'Width', 'Founding level']);
    expect(measurementPrompts('PCC below footings')[0]?.label).toBe(
      'PCC thickness',
    );
    expect(measurementPrompts('Footing reinforcement')[0]?.label).toBe(
      'Bar spacing',
    );
    expect(measurementPrompts('First floor brickwork')[0]?.label).toBe(
      'Wall thickness',
    );
    expect(measurementPrompts('Final cleaning')).toEqual([]);
  });

  it('groups the owner feed by date and floor', () => {
    const items = projectWorkItems({
      stages,
      execution,
      optional: [],
      plans: [
        plan('F3_SLAB', 0, '2026-11-12'),
        plan('F1_MASONRY', 0, '2026-11-12'),
        plan('F3_SLAB', 1, '2026-11-13'),
      ],
      work: [],
    });
    const groups = chronologicalGroups(items);
    expect(groups[0]?.date).toBe('2026-11-12');
    expect(groups[0]?.floors.map((f) => f.floor).sort()).toEqual(['F1', 'F3']);
    expect(groups.at(-1)?.date).toBe('');
  });

  it('parses read models defensively', () => {
    expect(
      parseOptional([
        { stage_id: 's', index: 1000, title: 'Extra', reason: 'r' },
        { bad: true },
      ]),
    ).toHaveLength(1);
    expect(
      parseEvents([
        { action: 'skip', stage_id: 's', index: 2, detail: { reason: 'n/a' } },
      ])[0]?.detail.reason,
    ).toBe('n/a');
    expect(parseCuring({})).toBeNull();
    expect(floorName('F3')).toBe('3rd floor');
    expect(floorName('GROUND')).toBe('Ground floor');
  });

  it('keeps homeowner supplier cash separate from company Finance', () => {
    const read = (path: string) =>
      readFileSync(new URL(path, import.meta.url), 'utf8');
    const migration = read(
      '../../../../../../packages/database/supabase/migrations/20261113230000_owner_homeowner_direct_cash_supplier_payment.sql',
    );
    const actions = read('./[id]/site/stage-checklist-actions.ts');
    const forms = read('./project-v2-forms.tsx');
    const view = read('./project-v2-view.tsx');
    expect(migration).toContain(
      'private.project_material_can_order(p_org, p_project)',
    );
    expect(migration).toContain(
      "v_material.status NOT IN ('ordered', 'received')",
    );
    expect(migration).toContain("homeowner_paid_method = 'cash'");
    expect(migration).toContain('homeowner_paid_request_hash');
    expect(migration).toContain("'already_recorded', true");
    expect(actions).toMatch(
      /client\.rpc\(\s*['"]project_material_homeowner_cash_paid['"]/,
    );
    expect(forms).toContain('Cash settlement only.');
    expect(view).toContain('Homeowner paid supplier directly · cash');
    expect(view).toContain('d.materialAccess.canOrder');
    expect(migration).not.toMatch(
      /public\.(payments|receipts|invoices|payment_requests)/,
    );
    expect(migration).not.toContain('payment_record');
    expect(forms).toContain(
      'it does not add a company receipt, invoice, or company cash expense',
    );
  });
});
