import type {
  Stage,
  StageExecution,
  StageItemPlan,
  StageItemRecord,
} from './project-v2-data';

/**
 * Pure, read-only projection of the canonical project records into one
 * chronological flow with a single next action per person. It never writes,
 * never infers completion, and never treats dates as permission to start:
 * stage execution status and database blockers decide what can move.
 */

export type FlowRole =
  'owner' | 'engineer' | 'watchman' | 'qc' | 'designer' | 'viewer';
export type WorkStatus =
  'pending' | 'in_progress' | 'on_hold' | 'completed' | 'skipped';
export type Measurement = { label: string; value: string; unit: string };
export type MeasurementPrompt = { label: string; unit: string };
export type OptionalItem = {
  stageId: string;
  index: number;
  title: string;
  reason: string;
};
export type WorkEvent = {
  stageId: string;
  index: number;
  action: string;
  fromStatus: string;
  toStatus: string;
  detail: Record<string, unknown>;
  actorId: string;
  createdAt: string;
};
export type CuringRound = {
  planId: string;
  title: string;
  roundAt: string;
  status: 'recorded' | 'due' | 'missed' | 'upcoming';
  gateId: string | null;
  late: boolean;
  remarks: string;
  hasPhoto: boolean;
  recordedByMe: boolean;
};
export type CuringState = {
  canRecord: boolean;
  canPlan: boolean;
  supervisor: boolean;
  missedTotal: number | null;
  plans: {
    id: string;
    stageId: string;
    title: string;
    specReference: string;
    startsOn: string;
    endsOn: string;
    roundTimes: string[];
    graceMinutes: number;
    status: string;
  }[];
  rounds: CuringRound[];
};
export type WorkItem = {
  key: string;
  stage: Stage;
  index: number;
  title: string;
  optional: boolean;
  status: WorkStatus;
  stageStatus: string;
  blockers: string[];
  assigneeId: string | null;
  crew: string;
  measurements: Measurement[];
  photoId: string;
  notes: string;
  skipReason: string;
  plannedStart: string;
  plannedFinish: string;
  floor: string;
};

const PLANNING = new Set([
  'QUOTED_SCOPE',
  'PRECONSTRUCTION',
  'DESIGN',
  'DESIGN_APPROVAL',
  'SITE_SURVEY',
]);
const text = (v: unknown) =>
  typeof v === 'string' || typeof v === 'number' ? String(v) : '';
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const workStatus = (v: unknown): WorkStatus =>
  (['pending', 'in_progress', 'on_hold', 'completed', 'skipped'] as const).find(
    (s) => s === v,
  ) ?? 'pending';

export const isDone = (s: WorkStatus) => s === 'completed' || s === 'skipped';
export function shouldShowAdvancePayment(
  advance:
    { invoiceId: string | null; scheduleActive: boolean } | null | undefined,
): boolean {
  return Boolean(advance && (advance.scheduleActive || advance.invoiceId));
}
export const isPhysicalStage = (stage: Stage) =>
  !PLANNING.has(stage.template_code);

export function flowRole(input: {
  canManage: boolean;
  siteRole: string;
  qcReviewer: boolean;
}): FlowRole {
  if (input.canManage) return 'owner';
  const role = input.siteRole;
  if (role === 'watchman') return 'watchman';
  if (
    role === 'quality_inspector' ||
    (input.qcReviewer && !['site_engineer', 'manager'].includes(role))
  )
    return 'qc';
  if (
    ['site_engineer', 'supervisor', 'site_supervisor', 'procurement'].includes(
      role,
    )
  )
    return 'engineer';
  if (['architect', 'structural_designer'].includes(role)) return 'designer';
  return 'viewer';
}

export function parseOptional(raw: unknown): OptionalItem[] {
  return list(raw).flatMap((x) => {
    const r = obj(x);
    const index = Number(r.index);
    return text(r.stage_id) && Number.isInteger(index) && text(r.title)
      ? [
          {
            stageId: text(r.stage_id),
            index,
            title: text(r.title),
            reason: text(r.reason),
          },
        ]
      : [];
  });
}

export function parseEvents(raw: unknown): WorkEvent[] {
  return list(raw).flatMap((x) => {
    const r = obj(x);
    return text(r.action)
      ? [
          {
            stageId: text(r.stage_id),
            index: Number(r.index) || 0,
            action: text(r.action),
            fromStatus: text(r.from_status),
            toStatus: text(r.to_status),
            detail: obj(r.detail),
            actorId: text(r.actor_id),
            createdAt: text(r.created_at),
          },
        ]
      : [];
  });
}

export function parseCuring(raw: unknown): CuringState | null {
  const r = obj(raw);
  if (!Array.isArray(r.plans)) return null;
  return {
    canRecord: r.can_record === true,
    canPlan: r.can_plan === true,
    supervisor: r.supervisor === true,
    missedTotal: typeof r.missed_total === 'number' ? r.missed_total : null,
    plans: list(r.plans).map((x) => {
      const p = obj(x);
      return {
        id: text(p.id),
        stageId: text(p.stage_id),
        title: text(p.title),
        specReference: text(p.spec_reference),
        startsOn: text(p.starts_on),
        endsOn: text(p.ends_on),
        roundTimes: list(p.round_times)
          .map(text)
          .map((t) => t.slice(0, 5)),
        graceMinutes: Number(p.grace_minutes) || 0,
        status: text(p.status),
      };
    }),
    rounds: list(r.rounds).map((x) => {
      const p = obj(x);
      const status =
        (['recorded', 'due', 'missed', 'upcoming'] as const).find(
          (s) => s === p.status,
        ) ?? 'upcoming';
      return {
        planId: text(p.plan_id),
        title: text(p.title),
        roundAt: text(p.round_at),
        status,
        gateId: text(p.gate_id) || null,
        late: p.late === true,
        remarks: text(p.remarks),
        hasPhoto: p.has_photo === true,
        recordedByMe: p.recorded_by_me === true,
      };
    }),
  };
}

function measurements(raw: unknown): Measurement[] {
  return list(raw).flatMap((x) => {
    const m = obj(x);
    return text(m.label)
      ? [{ label: text(m.label), value: text(m.value), unit: text(m.unit) }]
      : [];
  });
}

/** Every executable work item from the frozen stage snapshot plus
 * owner-added optional work, with its recorded state and schedule. */
export function projectWorkItems(input: {
  stages: readonly Stage[];
  work: readonly StageItemRecord[];
  optional: readonly OptionalItem[];
  plans: readonly StageItemPlan[];
  execution: readonly StageExecution[];
}): WorkItem[] {
  const exec = new Map(input.execution.map((e) => [e.stageId, e]));
  const record = new Map(
    input.work.map((w) => [text(w.stage_id) + ':' + Number(w.index), w]),
  );
  const plan = new Map(
    input.plans
      .filter((p) => p.kind === 'work')
      .map((p) => [p.stageId + ':' + p.index, p]),
  );
  return input.stages.filter(isPhysicalStage).flatMap((stage) => {
    const extra = input.optional.filter((o) => o.stageId === stage.id);
    const rows = [
      ...stage.activities.map((title, index) => ({
        title,
        index,
        optional: false,
      })),
      ...extra.map((o) => ({ title: o.title, index: o.index, optional: true })),
    ];
    const e = exec.get(stage.id);
    return rows.map((row) => {
      const key = stage.id + ':' + row.index;
      const r = record.get(key);
      const p = plan.get(key);
      return {
        key,
        stage,
        index: row.index,
        title: row.title,
        optional: row.optional,
        status: workStatus(r?.status),
        stageStatus: e?.status ?? 'not_started',
        blockers: e?.blockers ?? [],
        assigneeId: text(r?.assignee_id) || null,
        crew: text(r?.crew),
        measurements: measurements(r?.measurements),
        photoId: text(r?.photo_id),
        notes: text(r?.notes),
        skipReason: text(r?.skip_reason),
        plannedStart: p?.plannedStart ?? '',
        plannedFinish: p?.plannedFinish ?? '',
        floor: stage.floor_code ?? '',
      };
    });
  });
}

/** Measurement and check prompts shown to the engineer. They are prompts for
 * what to measure on site, never default values or acceptance limits. */
export function measurementPrompts(title: string): MeasurementPrompt[] {
  const t = title.toLowerCase();
  const rules: [RegExp, MeasurementPrompt[]][] = [
    [
      /excavat|trench|pit/,
      [
        { label: 'Depth', unit: 'mm' },
        { label: 'Width', unit: 'mm' },
        { label: 'Founding level', unit: 'm' },
      ],
    ],
    [
      /marking|setting out|layout/,
      [
        { label: 'Diagonal check', unit: 'm' },
        { label: 'Grid offset', unit: 'mm' },
      ],
    ],
    [
      /\bpcc\b|lean concrete|blinding/,
      [
        { label: 'PCC thickness', unit: 'mm' },
        { label: 'Top level', unit: 'm' },
      ],
    ],
    [
      /reinforc|rebar|steel|bar/,
      [
        { label: 'Bar spacing', unit: 'mm' },
        { label: 'Clear cover', unit: 'mm' },
        { label: 'Lap length', unit: 'mm' },
      ],
    ],
    [
      /shutter|formwork/,
      [
        { label: 'Alignment deviation', unit: 'mm' },
        { label: 'Support spacing', unit: 'mm' },
      ],
    ],
    [
      /concret|slab|column|beam|footing|pour/,
      [
        { label: 'Slump', unit: 'mm' },
        { label: 'Cube samples taken', unit: 'nos' },
      ],
    ],
    [
      /backfill|filling|compact/,
      [
        { label: 'Layer thickness', unit: 'mm' },
        { label: 'Compaction passes', unit: 'nos' },
      ],
    ],
    [
      /anti.?termite|termite/,
      [
        { label: 'Chemical applied', unit: 'litres' },
        { label: 'Area treated', unit: 'sqm' },
      ],
    ],
    [
      /brick|block|masonry|wall/,
      [
        { label: 'Wall thickness', unit: 'mm' },
        { label: 'Plumb deviation', unit: 'mm' },
        { label: 'Courses laid', unit: 'nos' },
      ],
    ],
    [
      /plaster|render/,
      [
        { label: 'Plaster thickness', unit: 'mm' },
        { label: 'Area completed', unit: 'sqm' },
      ],
    ],
    [
      /tile|floor|screed/,
      [
        { label: 'Level variation', unit: 'mm' },
        { label: 'Area completed', unit: 'sqm' },
      ],
    ],
  ];
  return rules.find(([re]) => re.test(t))?.[1] ?? [];
}

const inWindow = (item: WorkItem, day: string) =>
  Boolean(item.plannedStart) &&
  item.plannedStart <= day &&
  (item.plannedFinish || item.plannedStart) >= day;

export type FlowBuckets = {
  today: WorkItem[];
  tomorrow: WorkItem[];
  readyForQc: Stage[];
  awaitingQc: Stage[];
  blocked: { stage: Stage; blockers: string[] }[];
  active: Stage[];
};

/** Today: anything started or paused, plus open items of active stages that
 * are unscheduled or due. Tomorrow: open items planned for tomorrow. An
 * engineer sees only unassigned work or work assigned to them. */
export function flowBuckets(
  items: readonly WorkItem[],
  days: { today: string; tomorrow: string },
  viewer?: { userId: string; owner: boolean },
): FlowBuckets {
  const visible = items.filter(
    (i) =>
      !viewer ||
      viewer.owner ||
      !i.assigneeId ||
      i.assigneeId === viewer.userId,
  );
  const open = visible.filter((i) => !isDone(i.status));
  const today = open.filter(
    (i) =>
      i.status === 'in_progress' ||
      i.status === 'on_hold' ||
      (i.stageStatus === 'in_progress' &&
        (!i.plannedStart || i.plannedStart <= days.today)),
  );
  const todayKeys = new Set(today.map((i) => i.key));
  const tomorrow = open.filter(
    (i) => !todayKeys.has(i.key) && inWindow(i, days.tomorrow),
  );
  const stages = [...new Map(items.map((i) => [i.stage.id, i.stage])).values()];
  const of = (s: Stage) => items.filter((i) => i.stage.id === s.id);
  const status = (s: Stage) => of(s)[0]?.stageStatus ?? 'not_started';
  return {
    today: sortChronological(today),
    tomorrow: sortChronological(tomorrow),
    active: stages.filter((s) =>
      ['in_progress', 'on_hold'].includes(status(s)),
    ),
    readyForQc: stages.filter(
      (s) =>
        status(s) === 'in_progress' && of(s).every((i) => isDone(i.status)),
    ),
    awaitingQc: stages.filter((s) => status(s) === 'ready_for_qc'),
    blocked: stages
      .filter(
        (s) =>
          status(s) === 'not_started' && (of(s)[0]?.blockers.length ?? 0) > 0,
      )
      .map((s) => ({ stage: s, blockers: of(s)[0]?.blockers ?? [] })),
  };
}

export function sortChronological<T extends WorkItem>(
  items: readonly T[],
): T[] {
  return [...items].sort(
    (a, b) =>
      (a.plannedStart || '9999').localeCompare(b.plannedStart || '9999') ||
      a.stage.sequence - b.stage.sequence ||
      a.index - b.index,
  );
}

/** All work grouped by date, then floor, for the owner's chronological feed. */
export function chronologicalGroups(
  items: readonly WorkItem[],
): { date: string; floors: { floor: string; items: WorkItem[] }[] }[] {
  const byDate = new Map<string, WorkItem[]>();
  for (const item of sortChronological(items)) {
    const date = item.plannedStart || '';
    byDate.set(date, [...(byDate.get(date) ?? []), item]);
  }
  return [...byDate].map(([date, rows]) => {
    const floors = new Map<string, WorkItem[]>();
    for (const row of rows)
      floors.set(row.floor, [...(floors.get(row.floor) ?? []), row]);
    return {
      date,
      floors: [...floors].map(([floor, its]) => ({ floor, items: its })),
    };
  });
}

export type NextAction = {
  title: string;
  detail: string;
  anchor: string;
  tone: 'go' | 'wait' | 'alert' | 'done';
};

/** Exactly one next action for the person viewing the project. */
export function nextAction(
  role: FlowRole,
  b: FlowBuckets,
  curing: CuringState | null,
): NextAction {
  const due = curing?.rounds.filter((r) => r.status === 'due').length ?? 0;
  const missed =
    curing?.missedTotal ??
    curing?.rounds.filter((r) => r.status === 'missed').length ??
    0;
  if (role === 'watchman') {
    return due
      ? {
          title: 'Record curing round now',
          detail: due + ' round' + (due === 1 ? ' is' : 's are') + ' due',
          anchor: '#flow-curing',
          tone: 'go',
        }
      : {
          title: 'No curing round due',
          detail: 'Next rounds appear here when scheduled',
          anchor: '#flow-curing',
          tone: 'done',
        };
  }
  if (role === 'qc') {
    return b.awaitingQc.length
      ? {
          title: 'Inspect ' + b.awaitingQc[0]!.title,
          detail: b.awaitingQc.length + ' stage(s) awaiting your decision',
          anchor: '#flow-qc',
          tone: 'go',
        }
      : {
          title: 'No inspections waiting',
          detail: 'Stages appear here once engineers submit them',
          anchor: '#flow-qc',
          tone: 'done',
        };
  }
  if (role === 'owner' && missed > 0) {
    return {
      title: missed + ' curing round' + (missed === 1 ? '' : 's') + ' missed',
      detail: 'Follow up with the site team',
      anchor: '#flow-curing',
      tone: 'alert',
    };
  }
  const running = b.today.find((i) => i.status === 'in_progress');
  if (running)
    return {
      title: 'Finish: ' + running.title,
      detail: stageLabel(running.stage) + ' · add measurements and a photo',
      anchor: '#work-' + running.key.replace(':', '-'),
      tone: 'go',
    };
  if (b.readyForQc.length)
    return {
      title: 'Submit ' + b.readyForQc[0]!.title + ' for QC',
      detail: 'All work items are done',
      anchor: '#flow-qc',
      tone: 'go',
    };
  if (due)
    return {
      title: 'Record curing round',
      detail: due + ' round(s) due',
      anchor: '#flow-curing',
      tone: 'go',
    };
  const next = b.today.find((i) => i.status === 'pending') ?? b.today[0];
  if (next)
    return {
      title: 'Start: ' + next.title,
      detail: stageLabel(next.stage),
      anchor: '#work-' + next.key.replace(':', '-'),
      tone: 'go',
    };
  if (b.awaitingQc.length)
    return {
      title: 'Waiting for QC',
      detail: b.awaitingQc.map((s) => s.title).join(', '),
      anchor: '#flow-qc',
      tone: 'wait',
    };
  if (b.blocked.length)
    return {
      title: b.blocked[0]!.stage.title + ' is blocked',
      detail: b.blocked[0]!.blockers[0] ?? 'Prerequisites pending',
      anchor: '#flow-blocked',
      tone: 'wait',
    };
  return {
    title: 'Nothing due today',
    detail: 'Plan upcoming work in the timeline',
    anchor: '#flow-timeline',
    tone: 'done',
  };
}

export function stageLabel(stage: Stage): string {
  return stage.floor_code
    ? floorName(stage.floor_code) + ' · ' + stage.title
    : stage.title;
}
export function floorName(code: string): string {
  const m = /^F(\d+)$/.exec(code);
  if (m) {
    const n = Number(m[1]);
    const suffix = n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th';
    return n + suffix + ' floor';
  }
  return code === 'GROUND' || code === 'G'
    ? 'Ground floor'
    : code
        .replaceAll('_', ' ')
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase());
}
