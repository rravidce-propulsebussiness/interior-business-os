const legacyBoqEntities = new Set([
  'execution_estimates',
  'execution_estimate_revisions',
  'execution_estimate_scope_items',
  'execution_estimate_lines',
  'execution_estimate_line_costs',
  'estimation_recipes',
  'estimation_recipe_items',
  'estimation_recipe_item_costs',
]);

export function legacyBoqDestination(entity: string) {
  if (entity === 'materials') return '/dashboard/execution/boq';
  if (
    entity === 'estimation_recipes' ||
    entity.startsWith('estimation_recipe_')
  )
    return '/dashboard/execution/boq/pricing';
  if (legacyBoqEntities.has(entity)) return '/dashboard/execution/boq';
  return null;
}
