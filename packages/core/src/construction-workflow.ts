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
      'Agreement & preconstruction',
      'Confirm the commercial scope and site readiness before physical work.',
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
      'Architectural & structural design',
      'Control revisions and release only authorized drawings to the site.',
      ['PRECONSTRUCTION'],
      'client_design',
      [
        'Client design requirements and concept drawings',
        'Architectural floor plans and revisions',
        'Client comments, updated drawings and layout approval',
        '3D elevation where contracted',
        'Structural analysis and drawings',
        'Structural engineer review and approval',
        'Electrical, plumbing and MEP design coordination',
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
      'Site preparation & excavation',
      'Verify levels, layout, soil conditions and excavation before PCC.',
      ['DESIGN'],
      'quality',
      [
        'Site clearance and existing road/site level survey',
        'Boundary and reference point verification',
        'Site marking, grid lines and layout',
        'Excavation and depth/dimension checks',
        'Founding level and soil verification',
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
      'Foundation & footings',
      'Execute PCC, footing steel, concreting, curing and safe backfill.',
      ['SITE_PREP'],
      'structural',
      [
        'PCC preparation, concrete placement, curing and inspection',
        'Footing layout and dimensions verification',
        'Steel procurement, grade, brand, diameter and batch checks',
        'Bar bending schedule, cutting, tying and reinforcement fixing',
        'Bar spacing, laps, anchorage, ties and cover checks',
        'Footing shuttering, alignment and stability',
        'Mandatory pre-concrete structural inspection',
        'Footing concrete placement, pour and test records',
        'Footing curing and associated rounds',
        'Pedestal / starter columns',
        'Underground sump and relevant substructures where specified',
        'Backfilling, soil filling and compaction verification',
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
      'Plinth & ground preparation',
      'Complete plinth structural work and verify soil and ground levels.',
      ['FOUNDATION'],
      'structural',
      [
        'Plinth column reinforcement and shuttering',
        'Plinth beam reinforcement and tying',
        'Stirrups, joints, laps, cover and pre-pour inspection',
        'Plinth concrete placement, tests and curing',
        'Waterproofing and termite treatment where specified',
        'Soil/murram filling in approved layers',
        'Soil level, compaction and ground-floor preparation',
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
