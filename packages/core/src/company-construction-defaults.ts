import { z } from 'zod';

/** Reusable construction stage templates for company Settings. Pre-construction
 * and foundation run once; finish stages repeat for every quoted floor. */
export const constructionStageKinds = [
  'preconstruction',
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
    id: z.enum(constructionStageKinds),
    name: z.string().trim().min(2).max(100),
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
  .length(7)
  .superRefine((stages, ctx) => {
    const ids = stages.map((stage) => stage.id);
    if (
      new Set(ids).size !== 7 ||
      constructionStageKinds.some((id) => !ids.includes(id))
    )
      ctx.addIssue({
        code: 'custom',
        message: 'All seven construction stages are required.',
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
    repeatsPerFloor: false,
    days: 7,
    items: [
      {
        id: 'payment-preconstruction',
        kind: 'payment',
        title: 'Design advance payment',
        days: 0,
      },
    ],
  },
  {
    id: 'foundation',
    name: 'Foundation',
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
    repeatsPerFloor: true,
    days: 15,
    items: [
      { id: 'payment-slabs', kind: 'payment', title: 'Slabs payment', days: 0 },
    ],
  },
  {
    id: 'brickwork',
    name: 'Brickwork',
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
    repeatsPerFloor: true,
    days: 10,
    items: [
      { id: 'payment-tiles', kind: 'payment', title: 'Tiles payment', days: 0 },
    ],
  },
  {
    id: 'painting',
    name: 'Painting',
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
