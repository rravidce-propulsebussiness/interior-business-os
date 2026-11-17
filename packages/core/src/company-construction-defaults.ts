import { z } from 'zod';

/** Reusable construction stage templates for company Settings. Pre-construction
 * and foundation run once; finish stages repeat for every quoted floor. */
export const constructionStageKinds = [
  'preconstruction',
  'design',
  'foundation',
  'slabs',
  'brickwork',
  'electrical-plumbing',
  'tiles',
  'painting',
] as const;

export const companyStageItem = z
  .object({
    id: z.string().min(1).max(80),
    kind: z.enum(['work', 'material', 'check', 'test', 'qc', 'payment']),
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
    if (itemCount > 250)
      ctx.addIssue({
        code: 'custom',
        message:
          'A construction programme supports up to 250 work and inspection items.',
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
    days: 14,
    items: [
      {
        id: 'payment-design',
        kind: 'payment',
        title: 'Design payment',
        days: 0,
      },
      {
        id: 'design-floor-plan',
        kind: 'work',
        title: 'Floor plan approval',
        days: 5,
      },
      {
        id: 'design-structural',
        kind: 'work',
        title: 'Structural design approval',
        days: 5,
      },
      {
        id: 'design-mep',
        kind: 'work',
        title: 'Electrical and plumbing plans',
        days: 4,
      },
    ],
  },
  {
    id: 'foundation',
    name: 'Foundation',
    description: 'Excavation, footing, PCC and foundation works.',
    repeatsPerFloor: false,
    days: 20,
    items: [
      {
        id: 'payment-foundation',
        kind: 'payment',
        title: 'Foundation payment',
        days: 0,
      },
    ],
  },
  {
    id: 'slabs',
    name: 'Slabs',
    description: 'RCC slabs, formwork, reinforcement and concreting.',
    repeatsPerFloor: true,
    days: 15,
    items: [
      { id: 'payment-slabs', kind: 'payment', title: 'Slabs payment', days: 0 },
    ],
  },
  {
    id: 'brickwork',
    name: 'Brickwork',
    description: 'Wall construction and masonry works.',
    repeatsPerFloor: true,
    days: 15,
    items: [
      {
        id: 'payment-brickwork',
        kind: 'payment',
        title: 'Brickwork payment',
        days: 0,
      },
    ],
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
    id: 'tiles',
    name: 'Tiles',
    description: 'Floor and wall tiling, grouting and finishing.',
    repeatsPerFloor: true,
    days: 10,
    items: [
      { id: 'payment-tiles', kind: 'payment', title: 'Tiles payment', days: 0 },
    ],
  },
  {
    id: 'painting',
    name: 'Painting',
    description: 'Surface preparation and final painting.',
    repeatsPerFloor: true,
    days: 10,
    items: [
      {
        id: 'payment-painting',
        kind: 'payment',
        title: 'Painting payment',
        days: 0,
      },
    ],
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
