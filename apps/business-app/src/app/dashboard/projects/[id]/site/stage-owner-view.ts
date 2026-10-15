import { z } from 'zod';

export const stageOwnerSchema = z.object({
  can_edit: z.boolean(),
  overrides: z.array(z.object({
    stage_id: z.uuid(),
    title: z.string(),
    explanation: z.string(),
    activities: z.array(z.string()),
    display_order: z.number().int(),
    version: z.number().int().positive(),
  })),
});

export type StageOwnerData = z.infer<typeof stageOwnerSchema>;

export function mergeStageOwnerEdits<
  T extends {
    id: string;
    title: string;
    explanation: string;
    activities: string[];
  },
>(stages: T[], data: StageOwnerData | null): (T & {
  owner_version: number;
  display_order: number;
})[] {
  const indexed = new Map(
    data?.overrides.map((override) => [override.stage_id, override]) ?? [],
  );
  return stages.map((stage, index) => {
    const override = indexed.get(stage.id);
    return {
      ...stage,
      title: override?.title ?? stage.title,
      explanation: override?.explanation ?? stage.explanation,
      activities: override?.activities ?? stage.activities,
      owner_version: override?.version ?? 0,
      display_order: override?.display_order ?? index + 1,
    };
  }).sort((a, b) => a.display_order - b.display_order);
}
