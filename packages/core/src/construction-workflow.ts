import { z } from 'zod';

/**
 * Company-configurable construction blueprint. This module creates *definitions*,
 * not completed work, progress percentages, inspections, payments, or approvals.
 * PostgreSQL remains authoritative for all execution transitions and permissions.
 */
const stageCode = z
  .string()
  .regex(/^[A-Z][A-Z0-9_]*$/)
  .max(50);
const activity = z.string().trim().min(3).max(240);
const phase = z.enum([
  'preconstruction',
  'design',
  'site_preparation',
  'foundation',
  'plinth',
  'superstructure',
  'masonry',
  'finishes',
  'handover',
]);
const gate = z.enum([
  'contract',
  'client_design',
  'quality',
  'structural',
  'handover',
]);
export const constructionStageTemplateSchema = z
  .object({
    code: stageCode,
    phase,
    title: z.string().trim().min(3).max(140),
    explanation: z.string().trim().min(3).max(600),
    floorScoped: z.boolean(),
    previousFloorRequired: z.boolean().default(false),
    dependsOn: z.array(stageCode).max(40),
    holdPoint: gate.nullable(),
    activities: z.array(activity).min(1).max(80),
    inspectionTopics: z.array(activity).max(50),
  })
  .strict();

export const constructionWorkflowTemplateSchema = z
  .object({
    industry: z.literal('construction'),
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    stages: z.array(constructionStageTemplateSchema).min(1).max(300),
  })
  .strict();

export type ConstructionWorkflowTemplate = z.infer<
  typeof constructionWorkflowTemplateSchema
>;
export type ConstructionStageTemplate =
  ConstructionWorkflowTemplate['stages'][number];

function stage(
  code: string,
  phaseName: ConstructionStageTemplate['phase'],
  title: string,
  explanation: string,
  dependsOn: string[],
  holdPoint: ConstructionStageTemplate['holdPoint'],
  activities: string[],
  inspectionTopics: string[] = [],
  floorScoped = false,
  previousFloorRequired = false,
): ConstructionStageTemplate {
  return {
    code,
    phase: phaseName,
    title,
    explanation,
    dependsOn,
    holdPoint,
    activities,
    inspectionTopics,
    floorScoped,
    previousFloorRequired,
  };
}

/**
 * Starter definitions, never mandatory company defaults. Scope, permits,
 * materials, QC tests and curing targets come from approved project records.
 */
export const defaultConstructionWorkflow: ConstructionWorkflowTemplate = {
  industry: 'construction',
  version: '1.0.0',
  stages: [
    stage(
      'PRECONSTRUCTION',
      'preconstruction',
      'Final quotation & agreement',
      'Keep the project linked to its Final quotation and original payment groups. The agreement can be uploaded or the owner can record the quote-based choice. The reference agreement allows about 10 days after booking for survey, soil testing, structural preparation and contract meetings.',
      [],
      'contract',
      [
        'Accepted quotation and frozen specifications',
        'Agreement preparation and evidenced execution',
        'Contractual booking amount where applicable',
        'Site reconnaissance, survey and measurements',
        'Soil investigation and report where required',
        'Permits, permissions and site readiness documentation',
        'Preliminary construction schedule',
      ],
    ),
    stage(
      'DESIGN',
      'design',
      'Floor plan, structural, elevation & MEP plans',
      'Follow this order: floor plan and homeowner change loop, structural design, 3D elevation, then electrical and plumbing/MEP plans. A WhatsApp or offline share can be recorded with its existing reference; only actual homeowner decisions are recorded as approval.',
      ['PRECONSTRUCTION'],
      'client_design',
      [
        'Prepare and share the first architectural floor plan',
        'Record homeowner comments or requested floor-plan revisions',
        'Save the final floor-plan revision and homeowner decision',
        'Prepare structural analysis and drawings from the final floor plan',
        'Complete structural engineer review and homeowner decision',
        'Prepare and review the 3D elevation',
        'Prepare electrical and plumbing / MEP plans',
        'Record final homeowner design confirmation',
        'Controlled construction drawing issue and revision register',
      ],
      [
        'Latest approved architectural layout',
        'Approved structural drawings',
        'Relevant services coordination and drawing release',
      ],
    ),
    stage(
      'SITE_PREP',
      'site_preparation',
      'Site marking & excavation',
      'Reference agreement duration: 15–20 days for site inspection, design coordination, clearing and excavation. Record engineer dimensions and founding-level checks before PCC.',
      ['DESIGN'],
      'quality',
      [
        'Site clearance and existing road/site level survey',
        'Boundary and reference point verification',
        'Site marking and grid-line layout',
        'Excavation with length, width and depth measurements',
        'Engineer check of founding level and soil conditions',
        'Dewatering or ground treatment where specified',
        'QC clearance for PCC',
      ],
      [
        'Excavation dimensions and depth',
        'Soil/founding-level verification',
        'Approved PCC pre-work inspection',
      ],
    ),
    stage(
      'FOUNDATION',
      'foundation',
      'PCC, footings & columns to plinth',
      'Use the quote schedule as the duration guide: allow 2–4 days for material delivery/PCC preparation and about 15–20 days for footing, column, sump and foundation work. Site records—not the estimate—show actual progress.',
      ['SITE_PREP'],
      'structural',
      [
        'Material delivery and PCC below footings',
        'PCC mix, thickness, level and concrete checks',
        'Footing layout and dimensions verification',
        'Steel procurement, grade, brand, diameter and batch checks',
        'Bar bending schedule, cutting, tying and reinforcement fixing',
        'Bar spacing, laps, anchorage, ties and cover checks',
        'Footing shuttering, alignment and stability',
        'Mandatory pre-concrete structural inspection',
        'Footing concrete placement, pour and test records',
        'Footing curing and associated rounds',
        'Column reinforcement, shuttering and alignment to plinth level',
        'Engineer column dimensions, cover and verticality checks',
        'Column concreting and curing to plinth level',
        'Underground sump and relevant substructures where specified',
      ],
      [
        'Steel grade, batch, spacing, lap, anchorage and cover',
        'Concrete grade/source, shuttering and pre-pour clearance',
        'Actual footing dimensions, curing and test evidence',
      ],
    ),
    stage(
      'PLINTH',
      'plinth',
      'Backfill, plinth beam & ground preparation',
      'Reference duration: about 15–20 days for plinth, sump and filling work. Finish the plinth beam, backfill, basement preparation, soil leveling and specified anti-termite treatment before Ground Floor work.',
      ['FOUNDATION'],
      'structural',
      [
        'Backfill in measured layers and compact each layer',
        'Prepare the basement/formwork below the plinth beam',
        'Plinth beam reinforcement and tying',
        'Stirrups, joints, laps, cover and pre-pour inspection',
        'Plinth beam concreting, tests and curing',
        'Final soil leveling and compaction checks',
        'Anti-termite treatment where specified',
        'Ground-floor PCC bed and preparation',
        'QC clearance before next construction stage',
      ],
      [
        'Plinth reinforcement and cover',
        'Curing log',
        'Ground and compaction level evidence',
      ],
    ),
    stage(
      'RCC',
      'superstructure',
      'RCC structure',
      'Repeat the engineered structural cycle for each configured floor.',
      ['PLINTH'],
      'structural',
      [
        'Column reinforcement, formwork and alignment',
        'Column inspection, concrete placement and curing',
        'Beam and slab shuttering, beam reinforcement',
        'Slab and staircase reinforcement',
        'Electrical/plumbing conduits and embedded service inspection',
        'Mandatory structural pre-pour clearance',
        'Concrete placement, grade/source and test evidence',
        'Curing rounds and inspection',
        'Deshuttering approval where applicable',
        'Slab levels and structural acceptance checks',
      ],
      [
        'Column/beam/slab reinforcement and formwork',
        'Embedded services, concrete tests and pre-pour inspection',
        'Deshuttering authorization and curing evidence',
      ],
      true,
      true,
    ),
    stage(
      'MASONRY',
      'masonry',
      'Masonry & concealed services',
      'Coordinate walls, openings and services after the floor structure.',
      ['RCC'],
      'quality',
      [
        'Brick/block procurement and material inspection',
        'Wall layout, line, level and alignment',
        'Masonry execution',
        'Door and window opening verification',
        'Electrical conduits and plumbing concealed runs',
        'Pressure and leakage tests',
        'Lintels, sunshades and chajjas where specified',
        'Internal/external masonry quality checks',
      ],
      [
        'Masonry alignment and materials',
        'Opening dimensions and service coordination',
        'Concealed services and test evidence',
      ],
      true,
    ),
    stage(
      'FINISHES',
      'finishes',
      'Plaster, waterproofing & finishes',
      'Execute finishing works with documented quality tests.',
      ['MASONRY'],
      'quality',
      [
        'Internal and external plastering and curing',
        'Wet-area waterproofing preparation and application',
        'Waterproofing and leakage tests',
        'Screed and finished floor levels',
        'Floor and wall tiles, granite and stair finishes',
        'Doors and windows installation',
        'Putty, primer and painting',
        'Electrical wiring and fittings',
        'Plumbing sanitary and other fixtures',
        'Railings, gates and external works',
        'Finishing corrections and touch-ups',
      ],
      [
        'Approved waterproofing system and tests',
        'Levels and finishes quality',
        'Electrical/plumbing function tests',
      ],
      true,
    ),
    stage(
      'HANDOVER',
      'handover',
      'Final inspection & handover',
      'Release handover only after mandatory quality and document clearance.',
      ['FINISHES'],
      'handover',
      [
        'Final site inspections and punch list',
        'Defect rectification and reinspection',
        'Electrical and plumbing functional testing',
        'Waterproofing/leakage verification',
        'Final cleaning and as-built drawings',
        'Equipment manuals, warranties and documentation',
        'Client walkthrough and acknowledgements',
        'Contractual final-payment certification where required',
        'Handover documents and warranty start',
        'Defect service and warranty tracking',
      ],
      [
        'Mandatory inspections and critical snags closed',
        'Handover documents and client acknowledgement',
        'Final contract-specified certifications',
      ],
    ),
  ],
};

export const constructionFloorSchema = z
  .object({
    code: stageCode,
    name: z.string().trim().min(1).max(100),
  })
  .strict();
export type ConstructionFloor = z.infer<typeof constructionFloorSchema>;

export interface ConstructionStageInstance {
  readonly instanceCode: string;
  readonly templateCode: string;
  readonly phase: ConstructionStageTemplate['phase'];
  readonly title: string;
  readonly explanation: string;
  readonly floorCode: string | null;
  readonly dependsOn: readonly string[];
  readonly holdPoint: ConstructionStageTemplate['holdPoint'];
  readonly activities: readonly string[];
  readonly inspectionTopics: readonly string[];
}

/** Validate references, prevent cycles, and forbid a previous-floor gate on global stages. */
export function validateConstructionTemplate(
  input: unknown,
): ConstructionWorkflowTemplate {
  const template = constructionWorkflowTemplateSchema.parse(input);
  const byCode = new Map(template.stages.map((item) => [item.code, item]));
  if (byCode.size !== template.stages.length)
    throw new Error('Duplicate stage code');
  const visited = new Set<string>();
  const visiting = new Set<string>();
  function walk(code: string): void {
    if (visiting.has(code)) throw new Error('Circular stage dependency');
    if (visited.has(code)) return;
    const item = byCode.get(code);
    if (!item) throw new Error('Unknown stage dependency: ' + code);
    if (item.previousFloorRequired && !item.floorScoped)
      throw new Error('Previous-floor gate requires floor-scoped stage');
    visiting.add(code);
    for (const prior of item.dependsOn) walk(prior);
    visiting.delete(code);
    visited.add(code);
  }
  for (const item of template.stages) walk(item.code);
  return template;
}

/**
 * Resolve template dependencies into project/floor stage keys. Floor masonry
 * may run in parallel with structural work on later floors. No progress or
 * compliance values are synthesized from this expansion.
 */
export function expandConstructionStages(
  templateInput: unknown,
  floorsInput: unknown,
): ConstructionStageInstance[] {
  const template = validateConstructionTemplate(templateInput);
  const floors = z
    .array(constructionFloorSchema)
    .min(1)
    .max(64)
    .parse(floorsInput);
  if (new Set(floors.map((floor) => floor.code)).size !== floors.length)
    throw new Error('Duplicate floor code');
  const byCode = new Map(template.stages.map((stage) => [stage.code, stage]));
  const instanceCode = (code: string, floor?: ConstructionFloor) =>
    floor ? code + '/' + floor.code : code;
  const instances: ConstructionStageInstance[] = [];
  for (const current of template.stages) {
    const targets: (ConstructionFloor | undefined)[] = current.floorScoped
      ? floors
      : [undefined];
    for (const floor of targets) {
      const dependsOn = current.dependsOn.flatMap((dependencyCode) => {
        const dependency = byCode.get(dependencyCode)!;
        if (!dependency.floorScoped) return [instanceCode(dependencyCode)];
        return current.floorScoped && floor
          ? [instanceCode(dependencyCode, floor)]
          : floors.map((value) => instanceCode(dependencyCode, value));
      });
      if (current.previousFloorRequired && floor) {
        const index = floors.findIndex((item) => item.code === floor.code);
        if (index > 0)
          dependsOn.push(instanceCode(current.code, floors[index - 1]));
      }
      instances.push({
        instanceCode: instanceCode(current.code, floor),
        templateCode: current.code,
        phase: current.phase,
        title: current.title + (floor ? ' — ' + floor.name : ''),
        explanation: current.explanation,
        floorCode: floor?.code ?? null,
        dependsOn: [...new Set(dependsOn)],
        holdPoint: current.holdPoint,
        activities: current.activities,
        inspectionTopics: current.inspectionTopics,
      });
    }
  }
  const codes = new Set(instances.map((instance) => instance.instanceCode));
  for (const instance of instances) {
    if (instance.dependsOn.some((code) => !codes.has(code)))
      throw new Error('Unresolved project stage dependency');
  }
  return instances;
}
