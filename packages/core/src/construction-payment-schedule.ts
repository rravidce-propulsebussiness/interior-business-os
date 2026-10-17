import { defaultConstructionWorkflow, type ConstructionStageTemplate } from './construction-workflow';

/**
 * Starter scope/payment structure for a quoted multi-floor building.
 *
 * Plans are recommendations until saved by the quotation owner. The stage
 * associations never issue invoices, request money, certify a stage, order
 * materials, or set laboratory results. An engineer must customize checks
 * and test frequencies for the approved drawings, soil report and site.
 */
export type ProposedConstructionPayment = {
  name: string;
  percent: string;
  stageCodes: string[];
};

const floorCode = (name: string) => {
  const normalized = name.normalize('NFKD').toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return (/^[A-Z]/.test(normalized) ? normalized : 'F_' + normalized).slice(0, 50);
};
export const quotedConstructionFloorCode = floorCode;

function allocate(total: number, count: number): number[] {
  const hundredths = Math.round(total * 100);
  const base = Math.floor(hundredths / count);
  const remainder = hundredths - base * count;
  return Array.from({ length: count }, (_, index) =>
    (base + (index < remainder ? 1 : 0)) / 100);
}
const percent = (n: number) => n.toFixed(2);

/** Floors originate only from the quotation's saved SFT schedule. */
export function proposedConstructionPayments(floorNames: readonly string[]): ProposedConstructionPayment[] {
  if (floorNames.length === 0 || floorNames.length > 18)
    return [];
  const floors = floorNames.map(name => ({ name: name.trim(), code: floorCode(name) }));
  if (floors.some(x => !x.name) ||
      new Set(floors.map(x => x.code)).size !== floors.length)
    throw new Error('Quote needs distinct, named floors');

  // More than fourteen floors need grouping to remain inside the existing
  // forty-line quotation schedule limit; all floor dependencies stay intact.
  const groups: typeof floors[] = [];
  const groupSize = floors.length > 14 ? 2 : 1;
  for (let i = 0; i < floors.length; i += groupSize)
    groups.push(floors.slice(i, i + groupSize));

  const slabShares = allocate(27, floors.length);
  const masonryShares = allocate(15, floors.length);
  const result: ProposedConstructionPayment[] = [
    { name: 'Advance — agreement, planning, marking & excavation',
      percent: '10.00', stageCodes: ['PRECONSTRUCTION', 'DESIGN', 'SITE_PREP'] },
    { name: 'Foundation payment — PCC, footings, plinth & ground bed',
      percent: '18.00', stageCodes: ['FOUNDATION', 'PLINTH'] },
    ...floors.map((floor, index) => ({
      name: floor.name + ' slab payment',
      percent: percent(slabShares[index]!),
      stageCodes: ['RCC/' + floor.code],
    })),
    ...groups.map(group => ({
      name: group.map(f => f.name).join(' + ') + ' brickwork & door frames payment',
      percent: percent(group.reduce((sum, f) => sum + masonryShares[floors.indexOf(f)]!, 0)),
      stageCodes: group.map(f => 'MASONRY/' + f.code),
    })),
    { name: 'Inside plastering payment — concealed services & two coats',
      percent: '7.00', stageCodes: floors.map(f => 'INTERNAL_PLASTER/' + f.code) },
    { name: 'Outer plastering & elevation payment',
      percent: '5.00', stageCodes: ['EXTERNAL_PLASTER'] },
    { name: 'Plumbing & painting payment',
      percent: '8.00', stageCodes: floors.map(f => 'PLUMBING_PAINT/' + f.code) },
    { name: 'Tiles payment',
      percent: '6.00', stageCodes: floors.map(f => 'TILES/' + f.code) },
    { name: 'Doors payment',
      percent: '4.00', stageCodes: floors.map(f => 'DOORS/' + f.code) },
  ];
  if (result.length > 40) throw new Error('Construction payment schedule exceeds forty rows');
  if (Math.abs(result.reduce((sum, r) => sum + Number(r.percent), 0) - 100) > 0.001)
    throw new Error('Proposed percentages must total exactly 100');
  return result;
}

export type StageSiteGuidance = {
  materials: readonly string[];
  checks: readonly string[];
  reports: readonly string[];
};
const guidance: Record<string, StageSiteGuidance> = {
  PRECONSTRUCTION: {
    materials: ['Approved quote, agreement and drawings; site safety resources'],
    checks: ['Agreement and permit verification', 'Site survey and baseline documentation'],
    reports: ['Signed agreement evidence', 'Site survey and investigation reports'],
  },
  DESIGN: {
    materials: ['Approved structural, architectural and MEP drawings'],
    checks: ['Structural/design coordination approval', 'Drawing revision and release check'],
    reports: ['Architectural and structural approvals', 'Soil report and permitted design assumptions'],
  },
  SITE_PREP: {
    materials: ['Survey/marking materials, excavation protection and dewatering as required'],
    checks: ['Grid lines, set-out and boundary confirmation', 'Excavation depths and founding levels',
      'Engineer review of strata/soil report'],
    reports: ['Setting-out survey', 'Excavation photographs and founding approval'],
  },
  FOUNDATION: {
    materials: ['PCC, cement/concrete, aggregates, approved TMT steel and binding wire',
      'Formwork, waterproofing and sump materials where specified'],
    checks: ['PCC thickness and level', 'Footing reinforcement: spacing, grade, laps and cover',
      'Pre-pour shuttering clearance', 'Concrete slump/workability where specified',
      'Concrete sampling and compressive-strength results per approved QA plan', 'Footing curing record'],
    reports: ['Rebar test certificates', 'Pre-pour hold-point report', 'Concrete batch tickets and test register',
      'Curing log, sump leak test if contracted'],
  },
  PLINTH: {
    materials: ['Approved structural steel/concrete', 'Fill soil or murram', 'Anti-termite treatment if in scope',
      'Compaction equipment, ground PCC bed'],
    checks: ['Column and plinth-beam alignment, rebar and cover', 'Plinth concrete pre-pour inspection',
      'Layered soil filling/compaction and level checks',
      'Field density / compaction tests where designed',
      'Anti-termite treatment application evidence where contracted'],
    reports: ['Plinth concrete pour and strength test reports',
      'Compaction test log', 'Treatment records and curing log'],
  },
  RCC: {
    materials: ['Specified grade concrete, steel, formwork and supports',
      'Staircase shuttering, conduits and embedments'],
    checks: ['Column starter positions, cover, verticality and lap zones',
      'Column/stair/beam/slab steel and shuttering checks',
      'Embedded electrical conduit inspection before pour',
      'Slump/workability and concrete cube tests per QA plan',
      'Curing and engineered deshuttering clearance'],
    reports: ['Rebar and formwork inspection', 'Slab pre-pour clearance', 'Concrete pour/cube test log',
      'Curing and deshuttering report'],
  },
  MASONRY: {
    materials: ['Approved bricks/blocks, mortar and lintel materials', 'Door-frame material and anchors'],
    checks: ['Brick/block quality and dimensions', 'Wall line, level, plumb and bonding',
      'Door/window openings, frame position and fixing', 'Lintel and chajja support if applicable'],
    reports: ['Masonry site photos', 'Wall alignment and door frame checklist'],
  },
  INTERNAL_PLASTER: {
    materials: ['Electrical conduit boxes/pipes', 'Plumbing concealed pipes and fittings',
      'Internal plastering sand, cement or approved plaster material'],
    checks: ['Concealed electrical conduit routing and box locations',
      'Plumbing pressure/leak tests before covering',
      'First-coat thickness/bond and curing', 'Second-coat evenness and finish'],
    reports: ['Pre-closure photographs', 'Pressure/leak test evidence',
      'First/second coat and curing reports'],
  },
  EXTERNAL_PLASTER: {
    materials: ['External plaster materials, scaffolding and elevation finish/waterproof products'],
    checks: ['Scaffold safety and elevation layout', 'External plaster alignment and thickness',
      'Joints, corner treatment, curing and facade waterproof details'],
    reports: ['External plaster/elevation photos', 'Curing and facade inspection'],
  },
  PLUMBING_PAINT: {
    materials: ['Sanitary and plumbing fittings', 'Waterproofing and plumbing test equipment',
      'Primer, putty, paint and electrical accessories per quote'],
    checks: ['Water supply pressure/leakage test as specified',
      'Drainage flow and wet-area ponding checks where applicable',
      'Electrical insulation/continuity test by qualified personnel',
      'Substrate moisture/primer/paint coverage and finish'],
    reports: ['Plumbing pressure and sanitary function records',
      'Electrical test certificate when required', 'Painting coat inspection'],
  },
  TILES: {
    materials: ['Approved floor/wall tiles, adhesive/cement, grout and spacers'],
    checks: ['Base/substrate level and readiness', 'Bathroom slope and drainage',
      'Tile line, lippage, hollowness/adhesion and grout finish'],
    reports: ['Tile batch and laying register', 'Wet-area waterproof/flood test evidence'],
  },
  DOORS: {
    materials: ['Approved door shutters, frames, hinges, locks and finishing hardware'],
    checks: ['Frame plumb and opening clearance', 'Door alignment and operation',
      'Hardware function and final touch-up'],
    reports: ['Door schedule and room-wise inspection', 'Final hardware sign-off'],
  },
  HANDOVER: {
    materials: ['As-built drawings, warranty booklets and client handover documents'],
    checks: ['Snag close-out and final services tests', 'Final walkthrough and client acknowledgement'],
    reports: ['Final QC reports', 'Handover checklist and warranty record'],
  },
};
export function guidanceForConstructionStage(code: string): StageSiteGuidance {
  return guidance[code] ?? { materials: [], checks: [], reports: [] };
}

function extraStage(
  code: string, title: string, dependsOn: string[], activities: string[],
  floorScoped: boolean,
): ConstructionStageTemplate {
  const g = guidanceForConstructionStage(code);
  return {
    code,phase:'finishes',title,
    explanation:'Planned work only when included in the accepted quote; actual tests, approvals and materials must be recorded on site.',
    floorScoped,previousFloorRequired:false,dependsOn,holdPoint:'quality',
    activities,inspectionTopics:[...g.checks],
  };
}

/** Keep per-floor brickwork independent of subsequent upper-floor slab work. */
export function milestoneConstructionStages(): ConstructionStageTemplate[] {
  const result: ConstructionStageTemplate[] = [];
  for (const base of defaultConstructionWorkflow.stages) {
    if (base.code === 'HANDOVER') continue;
    const g = guidanceForConstructionStage(base.code);
    const updates: Partial<ConstructionStageTemplate> = {inspectionTopics:[...new Set([...base.inspectionTopics,...g.checks])]};
    if (base.code === 'FOUNDATION') updates.activities = [
      ...base.activities,
      'Columns through plinth and basement elements where included in the quote',
      'Sump placement, anti-termite application and soil compaction as specified',
    ];
    if (base.code === 'PLINTH') updates.activities = [
      ...base.activities,'Plinth beam and soil-filling inspection',
      'Ground PCC bed and prepared foundation slab where specified',
    ];
    if (base.code === 'RCC') updates.activities = [
      ...base.activities,
      'Column marking and starters for this floor',
      'Floor stair flight, slab electrical conduiting and beam/slab pre-pour record',
    ];
    if (base.code === 'MASONRY') updates.activities = [
      ...base.activities,
      'Door frames and frame-anchor inspection per quoted floor',
    ];
    // The old combined FINISHES stage is replaced with individually tracked
    // floor-level activities instead of rendering duplicate finishing work.
    if (base.code !== 'FINISHES') result.push({ ...base, ...updates });
  }
  result.push(
    extraStage('INTERNAL_PLASTER','Internal plaster & concealed services',['MASONRY'],[
      'Concealed electrical conduit and plumbing provision coordination',
      'Plumbing pressure and leak checks before closure',
      'Internal plaster first coat, curing, second coat and quality inspection',
    ],true),
    extraStage('EXTERNAL_PLASTER','External plaster & elevation',['MASONRY'],[
      'External plastering, elevation features and weatherproof detailing',
      'Curing and facade quality inspection',
    ],false),
    extraStage('PLUMBING_PAINT','Plumbing, electrical & painting',['INTERNAL_PLASTER'],[
      'Final plumbing fixture/service pressure and drainage checks',
      'Electrical safety verification by qualified personnel',
      'Putty, primer and approved painting coats',
    ],true),
    extraStage('TILES','Floor and wall tiles',['INTERNAL_PLASTER'],[
      'Wet-area waterproofing check and base/slope readiness',
      'Floor/wall tiling, grout and line/level checks',
    ],true),
    extraStage('DOORS','Door shutters & hardware',['MASONRY','TILES'],[
      'Fix door shutters, locks, hinges, handles and hardware',
      'Door operation, alignment and finish inspection',
    ],true),
  );
  const handover = defaultConstructionWorkflow.stages.find(s => s.code === 'HANDOVER')!;
  result.push({...handover,dependsOn:['EXTERNAL_PLASTER','PLUMBING_PAINT','TILES','DOORS'],
    inspectionTopics:[...new Set([...handover.inspectionTopics,...guidance.HANDOVER!.checks])]});
  return result;
}
