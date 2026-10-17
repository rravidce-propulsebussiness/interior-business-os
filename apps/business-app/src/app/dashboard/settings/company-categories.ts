export const companyCategoryOptions = [
  'Residential Construction',
  'Commercial Construction',
  'Interior Design & Execution',
  'Renovation / Remodeling',
  'Real Estate Services',
  'Structural Consulting',
  'Project Management',
  'Other Services',
] as const;

export type CompanyCategory = (typeof companyCategoryOptions)[number];
