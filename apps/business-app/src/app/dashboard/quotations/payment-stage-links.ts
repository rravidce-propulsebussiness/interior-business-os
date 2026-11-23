import { quotedConstructionFloorCode } from '@business-os/core/construction-floor-code';

/**
 * Project construction stages that a company-Settings payment milestone is
 * paid against. `stageIds` are the company workflow's stage ids, so a
 * workflow with separate plastering stages links plaster payments to the
 * plaster work instead of folding plaster into Electrical & plumbing.
 */
export function paymentStageCodes(
  stageId: string,
  floorName: string,
  floorNames: readonly string[],
  stageIds: readonly string[],
): string[] {
  const at = (code: string) =>
    code + '/' + quotedConstructionFloorCode(floorName);
  const everyFloor = (code: string) =>
    floorNames.map((floor) => code + '/' + quotedConstructionFloorCode(floor));
  const separatePlaster =
    stageIds.includes('internal-plastering-shelves') ||
    stageIds.includes('external-plastering-elevation');
  switch (stageId) {
    case 'preconstruction':
      return ['PRECONSTRUCTION'];
    case 'design':
      return ['DESIGN'];
    case 'foundation':
      return ['SITE_PREP', 'FOUNDATION', 'PLINTH'];
    case 'slabs':
      return [at('RCC')];
    case 'brickwork':
      return [at('MASONRY')];
    case 'electrical-plumbing':
      // Paid after plumbing and electrical work completion (final fixtures).
      return separatePlaster
        ? [at('PLUMBING_PAINT')]
        : [
            at('INTERNAL_PLASTER'),
            at('EXTERNAL_PLASTER'),
            at('PLUMBING_PAINT'),
          ];
    case 'internal-plastering-shelves':
      return [at('INTERNAL_PLASTER')];
    case 'external-plastering-elevation':
      // One whole-building façade milestone covers every floor's elevation.
      return floorName
        ? [at('EXTERNAL_PLASTER')]
        : everyFloor('EXTERNAL_PLASTER');
    case 'tiles':
      return [at('TILES')];
    case 'painting':
      return [at('DOORS')];
    default:
      return [];
  }
}
