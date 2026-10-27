export type RequirementType = 'text' | 'number' | 'select' | 'boolean';
export type RequirementField = {
  id: string;
  version: number;
  name: string;
  key: string;
  sortOrder: number;
  active: boolean;
  required: boolean;
  industryId: string | null;
  fieldType: RequirementType;
  options: string[];
};
export type RequirementIndustry = { id: string; name: string; key?: string };

export function mapRequirementField(
  value: Record<string, unknown>,
): RequirementField {
  const type = value.field_type;
  return {
    id: typeof value.id === 'string' ? value.id : '',
    version: typeof value.version === 'number' ? value.version : 1,
    name: typeof value.name === 'string' ? value.name : '',
    key: typeof value.key === 'string' ? value.key : '',
    sortOrder: typeof value.sort_order === 'number' ? value.sort_order : 0,
    active: value.active !== false,
    required: value.required === true,
    industryId:
      typeof value.industry_id === 'string' ? value.industry_id : null,
    fieldType:
      type === 'number' || type === 'select' || type === 'boolean'
        ? type
        : 'text',
    options: Array.isArray(value.options)
      ? value.options.filter((v): v is string => typeof v === 'string')
      : [],
  };
}
export function requirementKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}
export function applicableFields(
  fields: readonly RequirementField[],
  industryId: string | null,
) {
  return fields
    .filter(
      (field) =>
        field.active && (!field.industryId || field.industryId === industryId),
    )
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export type QuickRequirementField = RequirementField & {
  service: 'construction' | 'interior' | null;
};
// These questions already have dedicated inputs in Add Lead. A configured
// field must not render as a duplicate question next to its existing input.
const builtInKeys = new Set([
  'service',
  'project_type',
  'plot_area_sq_yards',
  'floors',
  'built_up_area_sq_ft',
  'budget',
  'timeline',
  'property_type',
  'bhk',
  'interior_scope',
  'selected_work',
  'design_style',
]);
export function isBuiltInRequirementKey(key: string) {
  return builtInKeys.has(key);
}
export function quickRequirementFields(
  fields: readonly QuickRequirementField[],
  service: 'construction' | 'interior',
): QuickRequirementField[] {
  const seen = new Set<string>();
  return fields
    .filter((field) => {
      if (
        !field.active ||
        isBuiltInRequirementKey(field.key) ||
        (field.service !== null && field.service !== service) ||
        seen.has(field.key)
      )
        return false;
      seen.add(field.key);
      return true;
    })
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}
