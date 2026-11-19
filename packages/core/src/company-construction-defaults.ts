import { z } from 'zod';
import {
  defaultFoundationDays,
  defaultFoundationWorkItems,
} from './foundation-workflow';
import { defaultSlabDays, defaultSlabWorkItems } from './slab-workflow';
import {
  defaultBrickworkDays,
  defaultBrickworkItems,
} from './brickwork-workflow';
import {
  defaultExternalPlasteringDays,
  defaultExternalPlasteringItems,
  defaultPaintingDays,
  defaultPaintingItems,
  defaultTilesDays,
  defaultTilesItems,
} from './finishing-workflows';

/** Reusable construction stage templates for company Settings. Pre-construction
 * and foundation run once; finish stages repeat for every quoted floor. */
export const constructionStageKinds = [
  'preconstruction',
  'design',
  'foundation',
  'slabs',
  'brickwork',
  'electrical-plumbing',
  'internal-plastering-shelves',
  'external-plastering-elevation',
  'tiles',
  'painting',
] as const;

export const companyStageItem = z
  .object({
    id: z.string().min(1).max(80),
    kind: z.enum([
      'work',
      'design',
      'material',
      'check',
      'test',
      'qc',
      'payment',
    ]),
    title: z.string().trim().min(2).max(180),
    days: z.coerce.number().int().min(0).max(365),
    guideText: z.string().trim().max(1800).optional(),
    guideVideoUrl: z.string().trim().max(1000).optional(),
  })
  .strict();

export const companyConstructionStage = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]{0,59}$/),
    name: z.string().trim().min(2).max(100),
    description: z.string().trim().max(300).optional(),
    // Legacy saved templates may still contain this field. New templates derive
    // payment values from the quotation, never from company percentages.
    percent: z.coerce.number().finite().positive().max(100).optional(),
    repeatsPerFloor: z.boolean(),
    days: z.coerce.number().int().min(0).max(365),
    items: z.array(companyStageItem).max(100),
  })
  .strict();

export const companyConstructionStages = z
  .array(companyConstructionStage)
  .min(1)
  .max(30)
  .superRefine((stages, ctx) => {
    const ids = stages.map((stage) => stage.id);
    if (new Set(ids).size !== stages.length)
      ctx.addIssue({
        code: 'custom',
        message: 'Stage identifiers must be unique.',
      });
    const itemIds = new Set<string>();
    let itemCount = 0;
    for (const [stageIndex, stage] of stages.entries()) {
      const seen = new Set<string>();
      let hasCheck = false;
      for (const [itemIndex, item] of stage.items.entries()) {
        itemCount++;
        if (itemIds.has(item.id))
          ctx.addIssue({
            code: 'custom',
            message: 'Stage item identifiers must be unique.',
            path: [stageIndex, 'items', itemIndex, 'id'],
          });
        itemIds.add(item.id);
        const key = item.kind + ':' + item.title.trim().toLowerCase();
        if (seen.has(key))
          ctx.addIssue({
            code: 'custom',
            message: 'Duplicate item in stage.',
            path: [stageIndex, 'items', itemIndex],
          });
        seen.add(key);
        if (item.guideVideoUrl && !/^https:\/\//i.test(item.guideVideoUrl))
          ctx.addIssue({
            code: 'custom',
            message: 'Guide video links must use https.',
            path: [stageIndex, 'items', itemIndex, 'guideVideoUrl'],
          });
        if (item.kind === 'check' || item.kind === 'test') hasCheck = true;
        if (item.kind === 'qc' && !hasCheck)
          ctx.addIssue({
            code: 'custom',
            message: 'QC must follow a site check or test in the same stage.',
            path: [stageIndex, 'items', itemIndex],
          });
      }
    }
    if (itemCount > 400)
      ctx.addIssue({
        code: 'custom',
        message:
          'A construction programme supports up to 400 work and inspection items.',
      });
  });

export type CompanyConstructionStage = z.infer<typeof companyConstructionStage>;
export type CompanyStageItem = z.infer<typeof companyStageItem>;

export const defaultCompanyConstructionStages: CompanyConstructionStage[] = [
  {
    id: 'preconstruction',
    name: 'Pre-construction',
    description: 'Site readiness, approvals and initial setup.',
    repeatsPerFloor: false,
    days: 7,
    items: [
      {
        id: 'payment-preconstruction',
        kind: 'payment',
        title: 'Price freeze payment',
        days: 0,
      },
    ],
  },
  {
    id: 'design',
    name: 'Design',
    description:
      'Architectural, structural and MEP design, drawings and approvals.',
    repeatsPerFloor: false,
    days: 15,
    items: [
      {
        id: 'payment-design',
        kind: 'payment',
        title: 'Design and Agreement Payment',
        days: 0,
      },
      {
        id: 'design-floor-plan',
        kind: 'design',
        title: 'Floor Plan',
        days: 5,
      },
      {
        id: 'design-structural',
        kind: 'design',
        title: 'Structural Plan',
        days: 5,
      },
      {
        id: 'design-elevation',
        kind: 'design',
        title: 'Elevation',
        days: 1,
      },
      {
        id: 'design-mep',
        kind: 'design',
        title: 'MEP Plans',
        days: 4,
      },
    ],
  },
  {
    id: 'foundation',
    name: 'Foundation',
    description:
      'Excavation, PCC, footings, columns, plinth beam, filling and soil treatment.',
    repeatsPerFloor: false,
    days: defaultFoundationDays,
    items: defaultFoundationWorkItems,
  },
  {
    id: 'slabs',
    name: 'Slabs',
    description:
      'Column starters, reinforcement, staircase, slab and beam works with QC and daily curing.',
    repeatsPerFloor: true,
    days: defaultSlabDays,
    items: defaultSlabWorkItems,
  },
  {
    id: 'brickwork',
    name: 'Brickwork',
    description:
      'Room marking, masonry, door frames, DPC, lintels, sajjas, final inspection and curing.',
    repeatsPerFloor: true,
    days: defaultBrickworkDays,
    items: defaultBrickworkItems,
  },
  {
    id: 'electrical-plumbing',
    name: 'Electrical & plumbing',
    description: 'Electrical and plumbing rough-in, conduits and fixtures.',
    repeatsPerFloor: true,
    days: 14,
    items: [
      {
        id: 'payment-electrical-plumbing',
        kind: 'payment',
        title: 'Electrical & plumbing payment',
        days: 0,
      },
    ],
  },
  {
    id: 'internal-plastering-shelves',
    name: 'Internal Plastering & Shelves',
    description:
      'Internal wall and ceiling plaster, embedded shelves or niches, corners, curing and finish checks.',
    repeatsPerFloor: true,
    // Unscheduled until the stage work sequence and duration are approved.
    days: 0,
    items: [
      {
        id: 'payment-internal-plastering',
        kind: 'payment',
        title: 'Internal Plastering & Shelves Payment',
        days: 0,
      },
    ],
  },
  {
    id: 'external-plastering-elevation',
    name: 'External Plastering & Elevation',
    description:
      'Whole-building exterior plaster, façade details, elevation finishes, curing and QC.',
    // Whole-building façade work is scheduled once rather than duplicated for each floor.
    repeatsPerFloor: false,
    days: defaultExternalPlasteringDays,
    items: defaultExternalPlasteringItems,
  },
  {
    id: 'tiles',
    name: 'Tiles',
    description:
      'Wet-area waterproofing, floor and wall tiling, grouting, protection and quality checks.',
    repeatsPerFloor: true,
    days: defaultTilesDays,
    items: defaultTilesItems,
  },
  {
    id: 'painting',
    name: 'Painting',
    description:
      'Surface preparation, putty, primer, interior and exterior paint coats, touch-ups and QC.',
    repeatsPerFloor: true,
    days: defaultPaintingDays,
    items: defaultPaintingItems,
  },
];

export const defaultInteriorStages: CompanyConstructionStage[] = [
  {
    id: 'pre-design',
    name: 'Pre-design',
    description: 'Brief, measurements and scope confirmation.',
    repeatsPerFloor: false,
    days: 5,
    items: [
      {
        id: 'interior-price-freeze',
        kind: 'payment',
        title: 'Price freeze',
        days: 0,
      },
    ],
  },
  {
    id: 'design',
    name: 'Design',
    description: 'Concept, layouts, 3D views and owner approvals.',
    repeatsPerFloor: false,
    days: 14,
    items: [
      {
        id: 'interior-design-payment',
        kind: 'payment',
        title: 'Design payment',
        days: 0,
      },
    ],
  },
  {
    id: 'procurement',
    name: 'Procurement',
    description: 'Material ordering and delivery coordination.',
    repeatsPerFloor: true,
    days: 10,
    items: [],
  },
  {
    id: 'installation',
    name: 'Installation',
    description: 'Site execution and installation work.',
    repeatsPerFloor: true,
    days: 20,
    items: [],
  },
  {
    id: 'finishing',
    name: 'Finishing',
    description: 'Final finishes, snagging and quality checks.',
    repeatsPerFloor: true,
    days: 8,
    items: [],
  },
  {
    id: 'handover',
    name: 'Handover',
    description: 'Client walkthrough and completion sign-off.',
    repeatsPerFloor: false,
    days: 2,
    items: [],
  },
];
