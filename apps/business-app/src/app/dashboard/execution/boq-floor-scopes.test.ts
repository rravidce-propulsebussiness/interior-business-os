import { describe, expect, it } from 'vitest';
import {
  copyExteriorWallsToFullFloors,
  syncAssumedFloorHeights,
} from './boq-floor-scopes';
import { floorsFromQuote } from '@business-os/core/construction-boq';
import { calculateSftEstimate } from '@business-os/core/sft-quotation';
import { applyPackageFloorHeight, linkedPackageFloorHeight, writeFloorRateDefaults } from '../pricing/construction/floor-rate-rules';
import type { BoqFloor, WallMeasure } from '@business-os/core/construction-boq';

const floors: BoqFloor[] = [
  {
    name: 'Ground Floor',
    areaSqft: 1000,
    lengthFeet: 25,
    widthFeet: 40,
    heightFeet: 10,
  },
  {
    name: 'First Floor',
    areaSqft: 1000,
    lengthFeet: 25,
    widthFeet: 40,
    heightFeet: 10,
  },
  {
    name: 'Second Floor',
    areaSqft: 1000,
    lengthFeet: 25,
    widthFeet: 40,
    heightFeet: 10,
  },
  {
    name: 'Terrace',
    areaSqft: 250,
    lengthFeet: 15,
    widthFeet: 17,
    heightFeet: 10,
    penthouseSqft: 250,
  },
];
const wall = (id: string, location: 'external' | 'internal'): WallMeasure => ({
  id,
  name: id,
  location,
  count: 1,
  lengthFeet: 25,
  heightFeet: 10,
  thicknessIn: location === 'external' ? 9 : 4.5,
});

describe('external wall repetition', () => {
  it('copies only external walls, not kitchens or internal walls, to ordinary floors', () => {
    const source = {
      'Ground Floor': [wall('ext-1', 'external'), wall('int-1', 'internal')],
      'First Floor': [wall('existing-interior', 'internal')],
    };
    const copied = copyExteriorWallsToFullFloors(
      floors,
      source,
      'Ground Floor',
    );
    expect(copied['First Floor']?.map((w) => w.location)).toEqual([
      'internal',
      'external',
    ]);
    expect(copied['Second Floor']).toHaveLength(1);
    expect(copied.Terrace).toBeUndefined();
    expect(copied['Ground Floor']).toEqual(source['Ground Floor']);
  });

  it('does not overwrite unique measured external wall dimensions', () => {
    const existing = wall('custom-external', 'external');
    existing.lengthFeet = 17;
    const copied = copyExteriorWallsToFullFloors(
      floors,
      {
        'Ground Floor': [wall('typical-external', 'external')],
        'First Floor': [existing],
      },
      'Ground Floor',
    );
    expect(copied['First Floor']).toEqual([existing]);
  });

  it('never uses penthouse itself as source or destination for bulk copy', () => {
    const existing = {
      Terrace: [wall('terrace-wall', 'external')],
    };
    expect(copyExteriorWallsToFullFloors(floors, existing, 'Terrace')).toBe(
      existing,
    );
  });
});

describe('quotation floor height synchronization', () => {
  it('uses confirmed linked quotation heights only for assumed saved BOQ floors', () => {
    const saved = [
      { ...floors[0]!, heightFeet: 10, heightAssumed: true },
      { ...floors[1]!, heightFeet: 12, heightAssumed: false },
      { ...floors[2]!, heightFeet: 10, heightAssumed: true },
    ];
    const quoted = [
      { ...floors[0]!, heightFeet: 11.5 },
      { ...floors[1]!, heightFeet: 11 },
      { ...floors[2]!, heightFeet: 10, heightAssumed: true },
    ];
    const synced = syncAssumedFloorHeights(saved, quoted);
    expect(synced[0]).toEqual({
      ...saved[0],
      heightFeet: 11.5,
      heightAssumed: false,
    });
    expect(synced[1]).toBe(saved[1]);
    expect(synced[2]).toBe(saved[2]);
    expect(syncAssumedFloorHeights(synced, quoted)).toBe(synced);
  });
});

describe('legacy package → quotation → saved BOQ', () => {
  it('replaces assumed heights using the exact configured package and preserves measured heights', () => {
    const rows = ['Ground Floor', 'First Floor', 'Second Floor'].map((name, index) => ({
      name, kind: 'floor' as const, lengthFeet: '40', widthFeet: '25',
      ratePerSqft: '2000', heightFeet: index === 0 ? '11' : '',
    }));
    const legacy = calculateSftEstimate({ rows, materialIds: [] }, []);
    const pkg = { id: 'a', name: 'Premium', code: 'PREMIUM', specSections: writeFloorRateDefaults([], { parking: '', penthouse: '' }, 32, '11.5') };
    const height = linkedPackageFloorHeight(pkg, [pkg]);
    const recovered = { ...legacy, rows: applyPackageFloorHeight(legacy.rows, height) };
    const saved = floorsFromQuote(legacy);
    const synced = syncAssumedFloorHeights(saved, floorsFromQuote(recovered));
    expect(synced.map(floor => floor.heightFeet)).toEqual([11, 11.5, 11.5]);
    expect(synced.every(floor => !floor.heightAssumed)).toBe(true);
    expect(synced[0]).toBe(saved[0]);
    expect(recovered.total).toBe(legacy.total);
  });
});
