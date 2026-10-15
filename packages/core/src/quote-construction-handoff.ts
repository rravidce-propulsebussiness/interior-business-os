import {
  defaultConstructionWorkflow,
  expandConstructionStages,
  type ConstructionFloor,
  type ConstructionWorkflowTemplate,
  type ConstructionStageInstance,
} from './construction-workflow';
import { parseSftEstimate, type SftEstimateDetails } from './sft-quotation';

export interface QuotedConstructionPlan {
  readonly floors: ConstructionFloor[];
  readonly template: ConstructionWorkflowTemplate;
  readonly stages: ConstructionStageInstance[];
  readonly quotedScope: SftEstimateDetails;
}

function namedFloorCode(name: string): string {
  const normalized = name
    .normalize('NFKD')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  // 1st Floor / G+1 are valid customer-facing quote labels, even though
  // internal construction stage IDs must start with a letter.
  return (/^[A-Z]/.test(normalized) ? normalized : 'F_' + normalized).slice(
    0,
    50,
  );
}

const description = (value: string) => value.trim().slice(0, 240);

/**
 * The issued/accepted quotation is the only source of these floor and scope
 * selections. Never reconstruct it from editable catalog rates or project labels.
 * Unstructured quotes return null: staff must correct the QUOTE, not enter a
 * competing floor plan in Site Delivery.
 */
export function constructionPlanFromQuotedDescriptions(
  descriptions: readonly string[],
): QuotedConstructionPlan | null {
  const parsed = descriptions
    .map((value) => parseSftEstimate(value))
    .filter((value): value is SftEstimateDetails => value !== null);
  if (parsed.length === 0) return null;
  if (parsed.length !== 1)
    throw new Error('The approved quote has multiple floor-wise schedules');
  const quotedScope = parsed[0]!;
  const floorRows = quotedScope.rows.filter((row) => row.kind !== 'additional');
  const floors: ConstructionFloor[] = floorRows.map((row) => ({
    code: namedFloorCode(row.name),
    name: row.name,
  }));
  if (
    floors.length < 1 ||
    floors.some((floor) => !/^[A-Z][A-Z0-9_]*$/.test(floor.code)) ||
    new Set(floors.map((floor) => floor.code)).size !== floors.length
  ) {
    throw new Error('Quote has duplicate or invalid floor names');
  }

  const activities: string[] = [
    'Use the customer-approved, issued quotation as the construction scope',
    ...floorRows.map((row) =>
      description(
        `${row.name}: ${row.areaSqft} sq ft quoted construction area`,
      ),
    ),
    ...quotedScope.rows
      .filter((row) => row.kind === 'additional')
      .map((row) =>
        description(
          `Additional quoted work: ${row.name}, ${row.areaSqft} sq ft`,
        ),
      ),
    ...(quotedScope.package
      ? [
          description(
            `Accepted package: ${quotedScope.package.name} (${quotedScope.package.code})`,
          ),
        ]
      : []),
    ...quotedScope.materials.map((material) =>
      description(
        `Quoted material — ${material.category}: ${material.name}, ${material.specification}`,
      ),
    ),
    ...(quotedScope.sections ?? []).map((section) =>
      description(
        `Included specification: ${section.title} — ${section.description}` +
          (section.brand ? ` | Brand: ${section.brand}` : '') +
          (section.grade ? ` | Grade: ${section.grade}` : ''),
      ),
    ),
  ];
  const template: ConstructionWorkflowTemplate = {
    ...defaultConstructionWorkflow,
    version: '1.0.1',
    stages: [
      {
        code: 'QUOTED_SCOPE',
        phase: 'preconstruction',
        title: 'Approved quotation & quoted specifications',
        explanation:
          'The accepted floors, work items and included materials are frozen from the customer quotation. They are not actual measurements, purchase orders or completed work.',
        floorScoped: false,
        previousFloorRequired: false,
        dependsOn: [],
        holdPoint: 'contract',
        activities,
        inspectionTopics: [],
      },
      ...defaultConstructionWorkflow.stages.map((stage) =>
        stage.code === 'PRECONSTRUCTION'
          ? { ...stage, dependsOn: ['QUOTED_SCOPE'] }
          : stage,
      ),
    ],
  };
  return {
    floors,
    template,
    stages: expandConstructionStages(template, floors),
    quotedScope,
  };
}
