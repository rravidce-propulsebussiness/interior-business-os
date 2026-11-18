import type {
  CompanyConstructionStage,
  CompanyStageItem,
} from '@business-os/core/company-construction-defaults';

/** Payment markers do not consume working days in a stage. */
export const scheduledStageItemDays = (
  items: readonly CompanyStageItem[],
): number =>
  items.reduce(
    (total, item) => total + (item.kind === 'payment' ? 0 : item.days),
    0,
  );

/**
 * Match the stage duration to its work sequence when scheduled item days
 * change. Preserve deliberate/manual stage durations for item reordering,
 * title/guide changes, and stages containing only payment markers.
 *
 * When the final scheduled item is removed, its stage duration becomes zero
 * instead of retaining an outdated total.
 */
export const stageWithUpdatedItems = (
  stage: CompanyConstructionStage,
  items: CompanyStageItem[],
  recalculate = false,
): CompanyConstructionStage => {
  const previousDays = scheduledStageItemDays(stage.items);
  const currentDays = scheduledStageItemDays(items);
  const hasOrHadScheduledItems = [...stage.items, ...items].some(
    (item) => item.kind !== 'payment',
  );
  return {
    ...stage,
    items,
    ...(hasOrHadScheduledItems && (recalculate || currentDays !== previousDays)
      ? { days: currentDays }
      : {}),
  };
};
