export type ConstructionSpecKind = 'plans' | 'material' | 'custom';
export type ConstructionExtraField = { label: string; value: string };
export type ConstructionSpecSection = {
  title: string;
  brand: string;
  grade: string;
  description: string;
  allowancePerSqft: string;
  kind?: ConstructionSpecKind;
  deliverables?: string[];
  extraFields?: ConstructionExtraField[];
};

export const ARCHITECTURAL_PLAN_OPTIONS = [
  'Architectural floor plan',
  'Structural floor plan',
  'Structural drawings',
  'Electrical layout',
  'Plumbing layout',
  '3D elevation views',
  'Exterior elevation',
  'Building sections',
  'Staircase details',
  'Working drawings',
  'Site layout',
  'Furniture layout',
] as const;

const categoryNames = [
  'Architectural plans',
  'Steel / TMT',
  'Cement',
  'Sand & aggregates',
  'Bricks / blocks',
  'Tiles / flooring',
  'Kitchen & granite',
  'Doors & windows',
  'Bathrooms & plumbing',
  'Electrical materials',
  'Painting',
  'Elevation & metal works',
  'Exclusions & warranty',
];

export function makeConstructionSection(
  title: string,
  kind: ConstructionSpecKind = 'material',
): ConstructionSpecSection {
  return {
    title,
    kind,
    brand: '',
    grade: '',
    description: '',
    allowancePerSqft: '',
    ...(kind === 'plans'
      ? { deliverables: [...ARCHITECTURAL_PLAN_OPTIONS.slice(0, 7)] }
      : {}),
    extraFields: [],
  };
}

export function constructionSectionKind(
  section: ConstructionSpecSection,
): ConstructionSpecKind {
  return (
    section.kind ??
    (/architectural|drawings|plans$/i.test(section.title) ? 'plans' : 'material')
  );
}

export function defaultConstructionSpecSections(): ConstructionSpecSection[] {
  return categoryNames.map((name, index) =>
    makeConstructionSection(
      name,
      index === 0 ? 'plans' : index === categoryNames.length - 1 ? 'custom' : 'material',
    ),
  );
}

export function filledConstructionSection(section: ConstructionSpecSection) {
  return Boolean(
    section.description.trim() ||
    section.brand.trim() ||
    section.grade.trim() ||
    section.allowancePerSqft.trim() ||
    section.deliverables?.length ||
    section.extraFields?.some((field) => field.value.trim()),
  );
}
