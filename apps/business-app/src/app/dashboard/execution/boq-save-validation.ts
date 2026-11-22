/**
 * Measurement integrity checks shared by the initial BOQ save and the
 * automatic editor saves. Reject overlapping manual and generated quantities
 * rather than silently doubling material and labour totals.
 */
type MeasurementLine = {
  name: string;
  section: string;
  kind: string;
  origin?: unknown;
  inputs: Record<string, unknown>;
};

const generatedForStage: Record<string, readonly string[]> = {
  excavation: ['quote-foundation'],
  pcc: ['quote-foundation'],
  footings: ['quote-foundation', 'quote-footings', 'quote-pedestals'],
  columns: ['quote-columns'],
  plinth: ['quote-plinth-beam'],
  beams: ['quote-beams', 'quote-slab'],
  slab: ['quote-slab'],
  staircase: ['quote-staircase'],
  brickwork: ['quote-masonry'],
  plaster: ['quote-masonry'],
  compound: ['quote-compound-wall'],
  parapet: ['quote-parapet'],
  waterproofing: ['quote-parapet'],
};

const legacyManualStructural = new Set([
  'excavation', 'footing', 'pedestal', 'column', 'plinth_beam',
  'beam', 'slab', 'wall', 'surface',
]);

export function validateBoqMeasurements(
  lines: readonly MeasurementLine[],
  hasQuotationSchedule: boolean,
): string | null {
  const overlap = lines.find((line) => {
    if (line.kind !== 'measured-geometry') return false;
    const category = String(line.inputs.stageCategory);
    const related = category === 'excavation'
      ? ['quote-foundation', 'quote-excavation']
      : category === 'pcc'
        ? ['quote-foundation', 'quote-pcc']
        : [];
    return related.length > 0 && lines.some(
      (generated) => Boolean(generated.origin) &&
        generated.section === line.section &&
        related.includes(generated.kind),
    );
  });
  if (overlap) {
    return 'Review ' + overlap.name + ': old quotation-generated foundation quantities also exist. Remove or reconcile the duplicate line before saving.';
  }

  const duplicated = lines.find((manual) => {
    if (manual.origin || manual.kind !== 'manual') return false;
    const kinds = generatedForStage[String(manual.inputs.stageCategory ?? '')];
    return kinds?.some((kind) => lines.some((generated) =>
      Boolean(generated.origin) &&
      generated.section === manual.section &&
      generated.kind === kind,
    ));
  });
  if (duplicated) {
    return 'Review ' + duplicated.name + ' in ' + duplicated.section + ': both a manual measurement and a drawing-generated measurement exist. Remove one before saving to avoid duplicate quantities.';
  }

  if (hasQuotationSchedule && lines.some(
    (line) => !line.origin && legacyManualStructural.has(line.kind),
  )) {
    return 'Remove overlapping manually measured structural or finishing items before saving. The quotation already generates these quantities.';
  }
  return null;
}
