import { describe, expect, it } from 'vitest';
import { validateBoqMeasurements } from './boq-save-validation';

const line = (
  name: string,
  section: string,
  kind: string,
  category = '',
  generated = false,
) => ({
  name, section, kind, origin: generated ? 'quotation' : undefined,
  inputs: { stageCategory: category },
});

describe('BOQ autosave measurement protections', () => {
  it('accepts new drawing measurements without their old provisional quotation equivalent', () => {
    expect(validateBoqMeasurements([
      line('Excavation 1', 'Foundation', 'measured-geometry', 'excavation'),
    ], true)).toBeNull();
  });

  it('blocks old generated excavation quantity plus new measured excavation', () => {
    const error = validateBoqMeasurements([
      line('Old', 'Foundation', 'quote-foundation', '', true),
      line('Excavation 1', 'Foundation', 'measured-geometry', 'excavation'),
    ], true);
    expect(error).toContain('Review Excavation 1');
  });

  it('blocks generated column totals and an overlapping manually added column', () => {
    const error = validateBoqMeasurements([
      line('Drawing columns', 'Ground Floor', 'quote-columns', '', true),
      line('Column extras', 'Ground Floor', 'manual', 'columns'),
    ], true);
    expect(error).toContain('Remove one before saving');
  });

  it('does not block different stages for the same labour/material work', () => {
    expect(validateBoqMeasurements([
      line('Drawing columns', 'Ground Floor', 'quote-columns', '', true),
      line('Column extras', 'First Floor', 'manual', 'columns'),
    ], true)).toBeNull();
  });

  it('protects quote-linked BOQs from duplicate legacy structural lines', () => {
    expect(validateBoqMeasurements([
      line('Legacy slab', 'Ground Floor', 'slab'),
    ], true)).toContain('Remove overlapping manually measured');
    expect(validateBoqMeasurements([
      line('Legacy slab', 'Ground Floor', 'slab'),
    ], false)).toBeNull();
  });
});
