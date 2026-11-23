/**
 * One project-wide set of indirect BOQ costs. These are not floor quantities
 * or procurement requests and must never be duplicated under each floor.
 */
export const BOQ_PROJECT_COST_FIELDS = [
  { key: 'siteSetup', label: 'Site setup and temporary facilities' },
  { key: 'utilities', label: 'Site water and temporary electricity' },
  { key: 'logistics', label: 'Transport, loading and unloading' },
  { key: 'equipment', label: 'Equipment and scaffolding hire' },
  { key: 'siteStaff', label: 'Site supervision and security' },
  { key: 'miscellaneous', label: 'Other project-wide expenses' },
] as const;

export type BoqProjectCostKey = (typeof BOQ_PROJECT_COST_FIELDS)[number]['key'];
export type BoqProjectCosts = Record<BoqProjectCostKey, number> & {
  contingencyPercent: number;
  taxes: number;
};

export const DEFAULT_BOQ_PROJECT_COSTS: BoqProjectCosts = {
  siteSetup: 0,
  utilities: 0,
  logistics: 0,
  equipment: 0,
  siteStaff: 0,
  miscellaneous: 0,
  contingencyPercent: 0,
  taxes: 0,
};

export function normalizeBoqProjectCosts(
  raw: Partial<BoqProjectCosts> | null | undefined,
): BoqProjectCosts {
  const normalized = { ...DEFAULT_BOQ_PROJECT_COSTS };
  for (const key of Object.keys(normalized) as (keyof BoqProjectCosts)[]) {
    const input = raw?.[key];
    normalized[key] =
      typeof input === 'number' && Number.isFinite(input)
        ? Math.min(
            Math.max(0, input),
            key === 'contingencyPercent' ? 100 : 100000000,
          )
        : 0;
  }
  return normalized;
}

const currency = (amount: number) => Math.round(amount * 100) / 100;

export function calculateBoqProjectCosts(
  materials: number,
  labour: number,
  values: BoqProjectCosts,
) {
  const directMaterials = currency(Math.max(0, materials));
  const directLabour = currency(Math.max(0, labour));
  const siteOverheads = currency(
    BOQ_PROJECT_COST_FIELDS.reduce((sum, field) => sum + values[field.key], 0),
  );
  const contingency = currency(
    ((directMaterials + directLabour + siteOverheads) *
      values.contingencyPercent) /
      100,
  );
  const taxes = currency(values.taxes);
  const projectWideCost = currency(siteOverheads + contingency + taxes);
  return {
    directMaterials,
    directLabour,
    siteOverheads,
    contingency,
    taxes,
    projectWideCost,
    total: currency(directMaterials + directLabour + projectWideCost),
  };
}
