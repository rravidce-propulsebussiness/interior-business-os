import { z } from 'zod';
import {
  defaultStageRequirements,
  type StageRequirementsMap,
  validateStageRequirementsDraft,
  encodeStageRequirements,
} from './quotation-stage-requirements';
import {
  standardMilestoneWorkflow,
  validateMilestoneFlow,
  encodeMilestoneFlow,
  type QuotationMilestoneFlow,
  type QuotationMilestoneStep,
} from './quotation-milestone-flow';
import { milestoneConstructionStages } from './construction-payment-schedule';

const validAreas = new Set(milestoneConstructionStages().map((x) => x.code));
export const companyWorkStep = z
  .object({
    kind: z.enum(['work', 'material', 'check', 'test', 'qc']),
    name: z.string().trim().min(2).max(180),
    area: z
      .string()
      .regex(/^[A-Z][A-Z_]*$/)
      .max(45),
  })
  .strict()
  .superRefine((item, ctx) => {
    if (!validAreas.has(item.area))
      ctx.addIssue({
        code: 'custom',
        message: 'Unknown construction work area',
      });
  });
export type CompanyWorkStep = z.infer<typeof companyWorkStep>;
const row = z
  .object({
    name: z.string().trim().min(2).max(100),
    percent: z
      .union([z.number(), z.string()])
      .transform((value) => Number(value))
      .pipe(z.number().finite().positive().max(100)),
    areas: z.array(z.string().max(45)).max(15).optional(),
    // A custom human-readable label is separate from the stable project stage
    // identifier so changing its text never breaks quotation/project mapping.
    areaLabels: z
      .record(z.string().max(45), z.string().trim().min(2).max(80))
      .optional(),
    steps: z.array(companyWorkStep).max(100).optional(),
  })
  .strict();
export const companyConstructionPaymentRows = z
  .array(row)
  .min(1)
  .max(40)
  .superRefine((rows, ctx) => {
    if (
      Math.abs(rows.reduce((sum, item) => sum + item.percent, 0) - 100) > 0.001
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Total payment percentage must be exactly 100%',
      });
    let total = 0;
    for (const [position, item] of rows.entries()) {
      total += item.steps?.length ?? 0;
      const seen = new Set<string>();
      const checked = new Set<string>();
      for (const [code] of Object.entries(item.areaLabels ?? {})) {
        if (!validAreas.has(code) || !(item.areas ?? []).includes(code))
          ctx.addIssue({
            code: 'custom',
            message: 'Area label must belong to a linked construction area',
            path: [position, 'areaLabels', code],
          });
      }
      for (const step of item.steps ?? []) {
        if (item.areas?.length && !item.areas.includes(step.area))
          ctx.addIssue({
            code: 'custom',
            message: 'Item must belong to this milestone work area',
            path: [position, 'steps'],
          });
        const key = step.area + ':' + step.kind + ':' + step.name.toLowerCase();
        if (seen.has(key))
          ctx.addIssue({
            code: 'custom',
            message: 'Duplicate item',
            path: [position, 'steps'],
          });
        seen.add(key);
        const check = step.area + ':' + step.name.toLowerCase();
        if (step.kind === 'check' || step.kind === 'test') checked.add(check);
        if (step.kind === 'qc' && !checked.has(check))
          ctx.addIssue({
            code: 'custom',
            message: 'Company QC must follow the matching site check or test',
            path: [position, 'steps'],
          });
      }
    }
    if (total > 150)
      ctx.addIssue({
        code: 'custom',
        message: 'A company template supports up to 150 steps',
      });
  });
export type CompanyConstructionPaymentRow = z.infer<
  typeof companyConstructionPaymentRows
>[number];

const areaHints: [RegExp, string][] = [
  [
    /(agreement|advance|pre.?construction|survey|permit|site\s*inspection)/i,
    'PRECONSTRUCTION',
  ],
  [/(design|drawing|floor\s*plan|architecture)/i, 'DESIGN'],
  [/(site\s*prep|marking|excavat|setting.?out|site\s*clearing)/i, 'SITE_PREP'],
  [
    /(foundation|footing|bar.?bend|reinforcement|pcc\b|pit.?dress)/i,
    'FOUNDATION',
  ],
  [/(plinth|basement)/i, 'PLINTH'],
  [/(rcc|slab|beam|column\s*casting)/i, 'RCC'],
  [/(brick|masonry|block\s*work)/i, 'MASONRY'],
  [/(external\s*plaster|outer\s*plaster|elevation)/i, 'EXTERNAL_PLASTER'],
  [/(internal\s*plaster|inside\s*plaster)/i, 'INTERNAL_PLASTER'],
  [/(plumb|paint|sanitary)/i, 'PLUMBING_PAINT'],
  [/(tile|flooring)/i, 'TILES'],
  [/(door|window)/i, 'DOORS'],
  [/(handover|warranty|final\s*inspection)/i, 'HANDOVER'],
];
/** Text labels are editable. Code is retained internally for valid project mapping.
 * Avoid guessing a wrong stage for a name that cannot be resolved. */
export function inferCompanyWorkAreaCode(name: string): string | null {
  const normal = name.trim();
  if (!normal) return null;
  const direct = normal
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  if (validAreas.has(direct)) return direct;
  for (const [pattern, code] of areaHints)
    if (pattern.test(normal) && validAreas.has(code)) return code;
  return null;
}
export function companyWorkAreaLabel(
  row: CompanyConstructionPaymentRow,
  code: string,
): string {
  return row.areaLabels?.[code] ?? code.replaceAll('_', ' ');
}
export function applyCompanyPaymentDefaults(
  suggested: readonly { name: string; percent: string; stageCodes: string[] }[],
  defaults: readonly CompanyConstructionPaymentRow[],
): { name: string; percent: string; stageCodes: string[] }[] {
  if (!defaults.length || defaults.length !== suggested.length)
    return suggested.map((x) => ({
      ...x,
      stageCodes: [...x.stageCodes],
    }));
  return suggested.map((row, i) => ({
    ...row,
    name: defaults[i]!.name,
    percent: String(defaults[i]!.percent),
    stageCodes: [...row.stageCodes],
  }));
}
const family = (code: string) => code.split('/')[0] ?? code;
function matches(
  row: { stageCodes: readonly string[] },
  template: CompanyConstructionPaymentRow,
) {
  const families = new Set(row.stageCodes.map(family));
  const areas = template.areas?.length
    ? template.areas
    : (template.steps ?? []).map((step) => step.area);
  return areas.some((area) => families.has(area));
}
/** Clone the editable company work-order template into a NEW quotation only.
 * Per-floor stage identifiers are derived from the actual quotation, never
 * copied from a company-level floor template.
 */
export function applyCompanyWorkDefaults(
  payments: readonly { stageCodes: string[] }[],
  defaults: readonly CompanyConstructionPaymentRow[],
  original: StageRequirementsMap = {},
): { requirements: StageRequirementsMap; flow: QuotationMilestoneFlow } {
  const requirements: StageRequirementsMap = { ...original };
  const planned: QuotationMilestoneFlow = {};
  const fallback = standardMilestoneWorkflow(payments, requirements);
  const seenCodes = new Set<string>();
  for (let i = 0; i < payments.length; i++) {
    const payment = payments[i]!;
    const chosen =
      defaults.length === payments.length
        ? defaults[i]
        : defaults.find((item) => matches(payment, item));
    const template = chosen?.steps ?? [];
    if (!template.length) {
      planned[String(i)] = fallback[String(i)] ?? [];
      continue;
    }
    const steps: QuotationMilestoneStep[] = [];
    const activeCodes = new Set<string>();
    for (const item of template) {
      const code = payment.stageCodes.find((x) => family(x) === item.area);
      if (!code || seenCodes.has(code)) continue;
      if (!activeCodes.has(code)) {
        activeCodes.add(code);
        const baseline = defaultStageRequirements(code);
        const structural =
          milestoneConstructionStages().find((x) => x.code === item.area)
            ?.holdPoint === 'structural';
        requirements[code] = {
          work: [],
          materials: [],
          checks: structural ? [...baseline.checks] : [],
          reports: [...baseline.reports],
        };
      }
      const scope = requirements[code]!;
      const field =
        item.kind === 'work'
          ? 'work'
          : item.kind === 'material'
            ? 'materials'
            : 'checks';
      let index = scope[field].indexOf(item.name);
      if (index === -1) {
        if (item.kind === 'qc') continue;
        index = scope[field].length;
        scope[field].push(item.name);
      }
      const value = { kind: item.kind, code, index } as QuotationMilestoneStep;
      if (
        steps.some(
          (x) =>
            x.code === value.code &&
            x.index === value.index &&
            (x.kind === value.kind ||
              (value.kind === 'test' && x.kind === 'check') ||
              (value.kind === 'check' && x.kind === 'test')),
        )
      )
        continue;
      steps.push(value);
    }
    for (const code of activeCodes) {
      seenCodes.add(code);
      const scope = requirements[code]!;
      const base = defaultStageRequirements(code);
      if (!scope.work.length)
        scope.work.push(base.work[0] ?? 'Review scope and approved drawings');
      // Structural hold points cannot be removed: place any missing ones after
      // company steps, keeping their QC independent.
      for (let j = 0; j < scope.work.length; j++)
        if (
          !steps.some(
            (s) => s.code === code && s.kind === 'work' && s.index === j,
          )
        )
          steps.push({ kind: 'work', code, index: j });
      for (let j = 0; j < scope.checks.length; j++)
        if (
          !steps.some(
            (s) =>
              s.code === code &&
              ['check', 'test'].includes(s.kind) &&
              s.index === j,
          )
        )
          steps.push({ kind: 'check', code, index: j });
      scope.flow = steps
        .filter((x) => x.code === code)
        .map(({ kind, index }) => ({ kind, index }));
    }
    planned[String(i)] = steps.length ? steps : (fallback[String(i)] ?? []);
  }
  // Preserve as many full milestones as can fit the bounded quotation terms.
  // In particular, a large floor-wise company template must not discard the
  // short Planning sequence and silently restore 31 older default checklist
  // items. Other stages still retain their canonical default guidance.
  const valid = (
    stages: StageRequirementsMap,
    plan: QuotationMilestoneFlow,
  ) => {
    validateStageRequirementsDraft(stages);
    validateMilestoneFlow(plan, stages, payments);
    encodeStageRequirements(stages);
    encodeMilestoneFlow(plan);
  };
  try {
    valid(requirements, planned);
    return { requirements, flow: planned };
  } catch {
    const keptRequirements: StageRequirementsMap = { ...original };
    const keptFlow: QuotationMilestoneFlow = {};
    for (let index = 0; index < payments.length; index++) {
      const payment = payments[index]!;
      const own = Object.fromEntries(
        payment.stageCodes.flatMap((code) =>
          requirements[code] && !keptRequirements[code]
            ? [[code, requirements[code]!]]
            : [],
        ),
      ) as StageRequirementsMap;
      const trialRequirements = { ...keptRequirements, ...own };
      const trialFlow = { ...keptFlow };
      if (planned[String(index)]?.length)
        trialFlow[String(index)] = planned[String(index)]!;
      try {
        valid(trialRequirements, trialFlow);
        Object.assign(keptRequirements, own);
        Object.assign(keptFlow, trialFlow);
      } catch {
        // Do not persist a partly copied stage. Built-in stage templates remain
        // available to the quotation until individual work is customized.
        const builtin = fallback[String(index)];
        if (!builtin?.length) continue;
        const fallbackTrial = { ...keptFlow, [String(index)]: builtin };
        try {
          valid(keptRequirements, fallbackTrial);
          Object.assign(keptFlow, fallbackTrial);
        } catch {
          /* This stage still uses canonical stage guidance at execution. */
        }
      }
    }
    return { requirements: keptRequirements, flow: keptFlow };
  }
}

/** The first priced Planning milestone. Payment is already represented by
 * the milestone amount in Finance; do not duplicate it as a work task. */
export const planningWorkDefaults: readonly CompanyWorkStep[] = [
  { kind: 'work', name: 'Price Freeze', area: 'PRECONSTRUCTION' },
  { kind: 'work', name: 'Agreement', area: 'PRECONSTRUCTION' },
  { kind: 'work', name: 'Floor Plan', area: 'DESIGN' },
  { kind: 'work', name: 'Structural Design', area: 'DESIGN' },
  { kind: 'work', name: 'MEP Plans', area: 'DESIGN' },
  { kind: 'check', name: 'Site Inspection', area: 'PRECONSTRUCTION' },
];

/** Stage 2 Foundation default: one payment, one site-execution sequence.
 * These are SCOPE/TEMPLATE items only, not completed work or QC certificates.
 * Stage-specific engineering hold-point checks are additionally mandatory
 * when a quotation becomes an executable project.
 * Do not repeat cement under separate generic/specific material entries.
 */
export const foundationWorkDefaults: readonly CompanyWorkStep[] = [
  { kind: 'work', name: 'Site marking', area: 'SITE_PREP' },
  { kind: 'work', name: 'Excavation', area: 'SITE_PREP' },
  { kind: 'work', name: 'Foundation pit dressing', area: 'SITE_PREP' },
  {
    kind: 'material',
    name: 'Sand (PCC, footings and columns)',
    area: 'FOUNDATION',
  },
  {
    kind: 'material',
    name: 'Cement (PCC, footings and columns)',
    area: 'FOUNDATION',
  },
  { kind: 'material', name: '40 mm aggregate (PCC)', area: 'FOUNDATION' },
  { kind: 'work', name: 'PCC', area: 'FOUNDATION' },
  { kind: 'check', name: 'Mix ratio check', area: 'FOUNDATION' },
  { kind: 'qc', name: 'Mix ratio check', area: 'FOUNDATION' },
  {
    kind: 'material',
    name: 'Reinforcement steel (footings, columns, plinth beam and sump)',
    area: 'FOUNDATION',
  },
  { kind: 'work', name: 'Bar bending', area: 'FOUNDATION' },
  { kind: 'work', name: 'Footing marking', area: 'FOUNDATION' },
  { kind: 'check', name: 'Footing marking checks', area: 'FOUNDATION' },
  { kind: 'qc', name: 'Footing marking checks', area: 'FOUNDATION' },
  { kind: 'work', name: 'Reinforcement installation', area: 'FOUNDATION' },
  { kind: 'check', name: 'Bar bending checks', area: 'FOUNDATION' },
  { kind: 'qc', name: 'Bar bending checks', area: 'FOUNDATION' },
  {
    kind: 'material',
    name: '20 mm aggregate (footings and columns)',
    area: 'FOUNDATION',
  },
  { kind: 'work', name: 'Footings', area: 'FOUNDATION' },
  { kind: 'work', name: 'Plinth level columns', area: 'PLINTH' },
  { kind: 'work', name: 'Soil backfilling', area: 'PLINTH' },
  { kind: 'work', name: 'Soil compaction', area: 'PLINTH' },
  {
    kind: 'work',
    name: 'Basement preparation for plinth beam',
    area: 'PLINTH',
  },
  { kind: 'work', name: 'Soil leveling and compaction', area: 'PLINTH' },
  { kind: 'work', name: 'Anti-termite treatment', area: 'PLINTH' },
  { kind: 'work', name: 'PCC bed', area: 'PLINTH' },
];

export function defaultCompanyWorkRows(
  payments: readonly { name: string; percent: string; stageCodes: string[] }[],
): CompanyConstructionPaymentRow[] {
  const result: CompanyConstructionPaymentRow[] = payments.map(
    (payment, index) => {
      const areas = [...new Set(payment.stageCodes.map(family))];
      // Only the standard Planning stage receives this sequence. Company-owned
      // customized payment templates and all other milestone defaults are retained.
      if (
        index === 0 &&
        payment.name === 'Planning' &&
        areas.includes('PRECONSTRUCTION') &&
        areas.includes('DESIGN')
      ) {
        return {
          name: payment.name,
          percent: Number(payment.percent),
          areas,
          steps: planningWorkDefaults.map((step) => ({ ...step })),
        };
      }
      // Fixed reference for the Foundation payment, not a new/parallel workflow.
      // Project-specific changes still belong to the quotation's own snapshot.
      if (
        index === 1 &&
        areas.includes('SITE_PREP') &&
        areas.includes('FOUNDATION') &&
        areas.includes('PLINTH')
      ) {
        return {
          name: payment.name,
          percent: Number(payment.percent),
          areas,
          steps: foundationWorkDefaults.map((step) => ({ ...step })),
        };
      }
      const steps: CompanyWorkStep[] = [];
      for (const area of areas) {
        const base = defaultStageRequirements(area);
        for (const name of base.work) steps.push({ kind: 'work', name, area });
        for (const name of base.materials.slice(0, 2))
          steps.push({ kind: 'material', name, area });
        for (const name of base.checks.slice(0, 2))
          steps.push({ kind: 'check', name, area });
      }
      return {
        name: payment.name,
        percent: Number(payment.percent),
        areas,
        steps,
      };
    },
  );
  return result;
}

/** Adds default editable steps to legacy name+percentage-only Settings rows.
 * Never replaces the owner's existing names, percentages, or custom steps.
 */
export function hydrateCompanyWorkDefaults(
  saved: readonly CompanyConstructionPaymentRow[],
  standard: readonly CompanyConstructionPaymentRow[],
): CompanyConstructionPaymentRow[] {
  return saved.map((row, index) => {
    if (row.steps !== undefined)
      return {
        ...row,
        areaLabels: { ...(row.areaLabels ?? {}) },
        steps: [...row.steps],
      };
    const example =
      saved.length === standard.length ? standard[index] : undefined;
    return {
      ...row,
      areaLabels: { ...(row.areaLabels ?? {}) },
      areas: [...(row.areas ?? example?.areas ?? [])],
      steps: [...(example?.steps ?? [])],
    };
  });
}
