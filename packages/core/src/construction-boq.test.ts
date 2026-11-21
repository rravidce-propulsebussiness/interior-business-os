import { describe, expect, it } from 'vitest';
import {
  cutPlan,
  DEFAULT_STRUCTURAL_SETTINGS,
  floorsFromQuote,
  generateQuotationBoq,
  lapFeet,
  normalizeStructuralSettings,
  parseBars,
  parseOpenings,
} from './construction-boq';
import { calculateSftEstimate } from './sft-quotation';

const quote = (
  heights: [string, string] = ['10', '10'],
  extraRows: Record<string, string>[] = [],
) =>
  calculateSftEstimate({
    rows: [
      {
        kind: 'floor',
        name: 'Ground Floor',
        lengthFeet: '30',
        widthFeet: '40',
        heightFeet: heights[0],
        ratePerSqft: '1850',
      },
      {
        kind: 'floor',
        name: 'First Floor',
        lengthFeet: '30',
        widthFeet: '40',
        heightFeet: heights[1],
        ratePerSqft: '1850',
        inheritFromPrevious: true,
      },
      {
        kind: 'additional',
        name: 'Compound wall',
        lengthFeet: '140',
        widthFeet: '1',
        unit: 'running_ft',
        ratePerSqft: '900',
      },
      ...extraRows,
    ],
    materialIds: [],
    sections: [
      {
        title: 'Main door',
        description: 'Teak main door',
        unit: 'door',
        pricingTreatment: 'allowance',
        allowanceValue: '25000',
      },
      {
        title: 'Internal doors',
        description: 'Flush doors',
        brand: 'Greenply',
        unit: 'door',
        pricingTreatment: 'allowance',
        allowanceValue: '10000',
      },
      {
        title: 'Bathroom fittings & plumbing',
        description: 'CP and sanitary',
        unit: 'bathroom',
        pricingTreatment: 'allowance',
        allowanceValue: '45000',
      },
      {
        title: 'Flooring tiles',
        description: 'Vitrified 2x2',
        unit: 'sqft',
        pricingTreatment: 'allowance',
        allowanceValue: '60',
      },
      {
        title: 'Electrical',
        description: 'Copper wiring',
        unit: 'none',
        pricingTreatment: 'included',
      },
    ],
  });

describe('steel cut planning from 40 ft stock bars', () => {
  it('cuts the foundation lift into 2 pieces per bar when it fits', () => {
    const plan = cutPlan(18.5, 40, 40, lapFeet(16, 50), 2);
    expect(plan).toMatchObject({
      piecesPerBar: 2,
      pieceFeet: 20,
      bars: 20,
      adjusted: false,
    });
  });

  it('cuts a 10 ft floor plus 50d lap into 3 pieces per bar', () => {
    // 16 mm × 50 = 800 mm ≈ 2.62 ft lap → 12.62 ft needed, 13.33 ft cut.
    const plan = cutPlan(10 + lapFeet(16, 50), 24, 40, lapFeet(16, 50), 3);
    expect(plan.piecesPerBar).toBe(3);
    expect(plan.bars).toBe(8);
    expect(plan.adjusted).toBe(false);
  });

  it('drops to 2 pieces per bar when floor height + lap no longer fits a third', () => {
    // 11 ft floor + 2.62 ft lap = 13.62 ft > 13.33 ft.
    const plan = cutPlan(11 + lapFeet(16, 50), 24, 40, lapFeet(16, 50), 3);
    expect(plan.piecesPerBar).toBe(2);
    expect(plan.bars).toBe(12);
    expect(plan.adjusted).toBe(true);
  });

  it('splices runs longer than one stock bar with laps', () => {
    const plan = cutPlan(60, 2, 40, 2);
    // Each 60 ft run needs one extra bar overlapping by 2 ft → 62 ft of bar.
    expect(plan.piecesPerBar).toBe(0);
    expect(plan.bars).toBe(Math.ceil((2 * 62) / 40));
  });
});

describe('quotation-driven construction BOQ', () => {
  it('reads floors, dimensions and floor heights from the quotation', () => {
    const floors = floorsFromQuote(quote(['10', '11']));
    expect(floors).toEqual([
      {
        name: 'Ground Floor',
        areaSqft: 1200,
        lengthFeet: 30,
        widthFeet: 40,
        heightFeet: 10,
      },
      {
        name: 'First Floor',
        areaSqft: 1200,
        lengthFeet: 30,
        widthFeet: 40,
        heightFeet: 11,
      },
    ]);
  });

  it('assumes the default floor height and warns when the quote has none', () => {
    const details = calculateSftEstimate({
      rows: [
        {
          kind: 'floor',
          name: 'Ground Floor',
          lengthFeet: '30',
          widthFeet: '40',
          ratePerSqft: '1850',
        },
      ],
      materialIds: [],
    });
    const result = generateQuotationBoq({ details });
    expect(result.floors[0]).toMatchObject({
      heightFeet: 10,
      heightAssumed: true,
    });
    expect(result.warnings.join(' ')).toContain(
      'floor height not on the quotation',
    );
  });

  it('groups the BOQ stage by stage so steel is brought floor by floor', () => {
    const result = generateQuotationBoq({ details: quote() });
    const sections = [...new Set(result.lines.map((line) => line.section))];
    // Design to handover, floor by floor.
    expect(sections).toEqual([
      'Design & approvals',
      'Foundation',
      'Ground Floor',
      'First Floor',
      'External works',
      'Handover',
    ]);
    const columns = result.lines.filter(
      (line) => line.kind === 'quote-columns',
    );
    // 30×40 ft on a 12 ft grid → 4 × 5 = 20 columns.
    expect(columns.map((line) => [line.section, line.inputs.columns])).toEqual([
      ['Foundation', 20],
      ['First Floor', 20],
    ]);
    // Foundation: half a 40 ft bar reaches the ground-floor roof + lap.
    expect(columns[0]?.notes).toContain(
      'Foundation → Ground Floor roof · 16 mm: 80 pcs, need 19.37 ft',
    );
    expect(columns[0]?.notes).toContain('cut 2/bar @ 20 ft → 40 bars');
    // First floor: 10 ft + 50d lap, a third of a bar each.
    expect(columns[1]?.notes).toContain(
      'First Floor · 16 mm: 80 pcs, need 12.62 ft (10 ft + lap 2.62 ft)',
    );
    expect(columns[1]?.notes).toContain('cut 3/bar @ 13.33 ft → 27 bars');
    const steel16 = columns[0]?.outputs.find(
      (output) => output.diameter === 16,
    );
    // Steel is bought in rods; the weight comes along for reference.
    expect(steel16).toMatchObject({ quantity: 40, unit: 'rod', rods: 40 });
    // Whole bars purchased: 40 × 12.19 m × 1.58 kg/m.
    expect(steel16?.weightKg).toBeCloseTo(40 * 40 * 0.3048 * (256 / 162), 0);
    // Every stage has its own binding wire.
    expect(
      result.lines
        .filter((line) => line.kind === 'quote-binding-wire')
        .map((line) => line.section),
    ).toEqual(['Foundation', 'Ground Floor', 'First Floor']);
    expect(result.steel.map((row) => row.diameter)).toEqual([8, 10, 12, 16]);
  });

  it('gives the ground floor its own lift when the foundation is deep', () => {
    const result = generateQuotationBoq({
      details: quote(),
      settings: { foundationDepthFeet: 7 },
    });
    const columns = result.lines.filter(
      (line) => line.kind === 'quote-columns',
    );
    expect(columns.map((line) => line.section)).toEqual([
      'Foundation',
      'Ground Floor',
      'First Floor',
    ]);
    // Foundation still 2 pieces per bar, ending one lap above plinth.
    expect(columns[0]?.notes).toContain('Foundation → plinth · 16 mm');
    expect(columns[0]?.notes).toContain('cut 2/bar @ 20 ft');
    expect(columns[1]?.notes).toContain(
      'Ground Floor · 16 mm: 80 pcs, need 12.62 ft (10 ft + lap 2.62 ft), cut 3/bar',
    );
    expect(result.warnings.join(' ')).toContain('stop 2.62 ft above plinth');
  });

  it('reduces cuts per bar when a taller floor needs more length', () => {
    const result = generateQuotationBoq({ details: quote(['10', '11']) });
    const columns = result.lines.find(
      (line) => line.kind === 'quote-columns' && line.section === 'First Floor',
    );
    expect(columns?.notes).toContain(
      'First Floor · 16 mm: 80 pcs, need 13.62 ft (11 ft + lap 2.62 ft), cut 2/bar',
    );
    expect(
      result.warnings.some((w) => w.startsWith('First Floor columns, 16 mm')),
    ).toBe(true);
  });

  it('takes quantities from the quote and costs from the rate card', () => {
    const floorCounts = {
      mainDoors: 0,
      internalDoors: 6,
      bathroomDoors: 3,
      poojaDoors: 0,
      windows: 8,
      ventilators: 3,
      bathrooms: 3,
    };
    const result = generateQuotationBoq({
      details: quote(),
      counts: {
        floors: {
          'Ground Floor': {
            ...floorCounts,
            mainDoors: 1,
            poojaDoors: 1,
            bathroomDoors: 2,
            bathrooms: 2,
          },
          'First Floor': floorCounts,
        },
      },
    });
    const outputs = (section: string, kind: string) =>
      result.lines
        .find((line) => line.section === section && line.kind === kind)!
        .outputs.map((output) => ({
          name: output.name,
          quantity: output.quantity,
          unit: output.unit,
          rate: output.rate,
          quotedRate: output.quotedRate,
          material: output.material,
        }));
    expect(outputs('Ground Floor', 'quote-doors-windows')).toEqual([
      {
        name: 'Main door',
        quantity: 1,
        unit: 'door',
        rate: undefined,
        quotedRate: 25000,
        material: 'door_main',
      },
      {
        name: 'Bedroom / internal door',
        quantity: 6,
        unit: 'door',
        rate: undefined,
        quotedRate: 10000,
        material: 'door_internal',
      },
      // "Internal doors" also prices bathroom and pooja doors.
      {
        name: 'Bathroom door',
        quantity: 2,
        unit: 'door',
        rate: undefined,
        quotedRate: 10000,
        material: 'door_bathroom',
      },
      {
        name: 'Pooja door',
        quantity: 1,
        unit: 'door',
        rate: undefined,
        quotedRate: 10000,
        material: 'door_pooja',
      },
      // No window allowance: priced from the rate card.
      {
        name: 'Windows',
        quantity: 128,
        unit: 'sqft',
        rate: undefined,
        quotedRate: undefined,
        material: 'window',
      },
      {
        name: 'Ventilators',
        quantity: 3,
        unit: 'each',
        rate: undefined,
        quotedRate: undefined,
        material: 'ventilator',
      },
      {
        name: 'Door fixing labour',
        quantity: 10,
        unit: 'door',
        rate: undefined,
        quotedRate: undefined,
        material: 'labour_door_fixing',
      },
    ]);
    // No rooms entered: 85% of 1,200 sqft + 5% wastage, at the quoted ₹60.
    expect(outputs('First Floor', 'quote-flooring')[0]).toEqual({
      name: 'Room flooring tiles',
      quantity: 1071,
      unit: 'sqft',
      rate: undefined,
      quotedRate: 60,
      material: 'floor_tiles',
    });
    // "Bathroom fittings & plumbing" is charged once per bathroom.
    const services = outputs('First Floor', 'quote-services');
    expect(
      services.find((o) => o.name === 'Sanitary ware & CP fittings'),
    ).toMatchObject({
      quantity: 3,
      quotedRate: 45000,
      material: 'sanitary_cp',
    });
    // The fittings allowance is accessories only: pipes are costed too.
    // 3 bathrooms × 6 + 1 kitchen × 2 = 20 water points × 3 m = 20 pipes.
    expect(services.find((o) => o.material === 'cpvc_half')).toMatchObject({
      quantity: 20,
      unit: 'pipe',
      quotedRate: undefined,
    });
    expect(services.find((o) => o.material === 'floor_trap')?.quantity).toBe(4);
    expect(services.some((o) => o.material === 'swr_110')).toBe(true);
    expect(services.some((o) => o.material === 'bathroom_waterproofing')).toBe(
      true,
    );
    expect(services.find((o) => o.name === 'Plumbing labour')).toMatchObject({
      quantity: 3,
      material: 'labour_plumbing',
    });
    expect(
      result.lines.some((line) => line.origin === 'quotation-allowance'),
    ).toBe(false);
  });

  it('measures a compound wall quoted as wall area under External works', () => {
    const details = calculateSftEstimate({
      rows: [
        {
          kind: 'floor',
          name: 'Ground Floor',
          lengthFeet: '40',
          widthFeet: '30',
          heightFeet: '10',
          ratePerSqft: '1650',
        },
        {
          kind: 'additional',
          name: 'Compound Wall',
          lengthFeet: '140',
          widthFeet: '1',
          heightFeet: '6',
          unit: 'wall_sqft',
          ratePerSqft: '350',
        },
      ],
      materialIds: [],
    });
    const result = generateQuotationBoq({ details });
    expect(result.counts.compoundWallFeet).toBe(140);
    const wall = result.lines.find(
      (line) => line.kind === 'quote-compound-wall',
    );
    expect(wall).toMatchObject({
      section: 'External works',
      quotedPrice: 294000,
      inputs: { lengthFeet: 140, heightFeet: 6 },
    });
    expect(wall?.outputs[0]).toMatchObject({
      quantity: 840,
      material: 'labour_brickwork_9',
    });
    expect(
      wall?.outputs.find((output) => output.name === 'External plaster'),
    ).toMatchObject({ quantity: 1680, material: 'plaster_labour' });
    // Not repeated as an unpriced additional work.
    expect(
      result.lines.some((line) => line.section === 'Additional quoted works'),
    ).toBe(false);
  });

  it('adds parapet, compound wall, gate, design and handover items', () => {
    const result = generateQuotationBoq({ details: quote() });
    const parapet = result.lines.find((line) => line.kind === 'quote-parapet');
    // Top floor only: 140 ft perimeter × 3 ft.
    expect(parapet?.section).toBe('First Floor');
    expect(parapet?.outputs[0]).toMatchObject({ quantity: 420, unit: 'sqft' });
    expect(parapet?.outputs.some((o) => o.material === 'waterproofing')).toBe(
      true,
    );
    // Compound wall length comes from the quoted running-ft row.
    const compound = result.lines.find(
      (line) => line.kind === 'quote-compound-wall',
    );
    expect(compound).toMatchObject({ section: 'External works' });
    expect(compound?.inputs.lengthFeet).toBe(140);
    expect(
      result.lines.find((line) => line.kind === 'quote-gate')?.outputs[0],
    ).toMatchObject({
      quantity: 1,
      material: 'gate',
    });
    expect(result.lines[0]).toMatchObject({ section: 'Design & approvals' });
    expect(result.lines.at(-1)).toMatchObject({ section: 'Handover' });
    // Purchase units.
    const units = new Set(
      result.lines.flatMap((line) =>
        line.outputs
          .filter((o) =>
            ['sand', 'aggregate', 'cement', 'bricks', 'steel'].includes(
              o.material ?? '',
            ),
          )
          .map((o) => `${o.material}:${o.unit}`),
      ),
    );
    expect([...units].sort()).toEqual([
      'aggregate:t',
      'bricks:nos',
      'cement:bag',
      'sand:t',
      'steel:rod',
    ]);
  });

  it('keeps additional quoted works as manual lines with their quoted price', () => {
    const details = quote(undefined, [
      {
        kind: 'additional',
        name: 'Borewell',
        lengthFeet: '1',
        widthFeet: '1',
        unit: 'lumpsum',
        ratePerSqft: '90000',
      },
    ]);
    const result = generateQuotationBoq({ details });
    expect(result.lines.find((line) => line.name === 'Borewell')).toMatchObject(
      {
        origin: 'quotation-additional',
        section: 'Additional quoted works',
        quotedPrice: 90000,
      },
    );
    // The quoted compound wall is measured under External works and keeps
    // its quoted price there.
    expect(
      result.lines.find((line) => line.kind === 'quote-compound-wall'),
    ).toMatchObject({ section: 'External works', quotedPrice: 126000 });
    expect(result.lines.some((line) => line.name === 'Compound wall')).toBe(
      false,
    );
  });

  it('adds pedestals to the foundation only when a height is set', () => {
    const none = generateQuotationBoq({ details: quote() });
    expect(none.lines.some((line) => line.kind === 'quote-pedestals')).toBe(
      false,
    );
    const withPedestals = generateQuotationBoq({
      details: quote(),
      settings: { pedestalHeightFeet: 2 },
    });
    const pedestals = withPedestals.lines.find(
      (line) => line.kind === 'quote-pedestals',
    );
    expect(pedestals?.section).toBe('Foundation');
    expect(pedestals?.inputs.pedestals).toBe(20);
    // 20 × 15 in × 15 in × 2 ft = 62.5 cft ≈ 1.77 m³, ready-mix M20 + 3%.
    expect(pedestals?.outputs[0]).toMatchObject({
      material: 'concrete_m20',
      unit: 'm³',
    });
    expect(pedestals?.outputs[0]?.quantity).toBeCloseTo(1.82, 2);
    expect(pedestals?.outputs.some((output) => output.diameter === 8)).toBe(
      true,
    );
    // Foundation stage stays first, footing → pedestals → column lift.
    expect(
      withPedestals.lines
        .filter((line) => line.section === 'Foundation')
        .map((line) => line.kind),
    ).toEqual([
      'quote-foundation',
      'quote-pedestals',
      'quote-columns',
      'quote-plinth-beam',
      'quote-binding-wire',
    ]);
  });

  it('builds the drawing column grid, kitchens, shutters, water storage and itemized labour', () => {
    const counts = {
      floors: {
        'Ground Floor': { rollingShutters: 1, bathrooms: 1, kitchens: 0 },
        'First Floor': { kitchens: 2, bathrooms: 3 },
      },
      entranceGates: 1,
      compoundWallFeet: 0,
    };
    const result = generateQuotationBoq({
      details: quote(),
      counts,
      settings: {
        columnRows: 6,
        columnsPerRow: 2,
        extraColumns: 2,
        sumpLitres: 6500,
        overheadTankLitres: 4000,
        labourItemized: 1,
      },
    });
    const outputs = (section: string) =>
      result.lines
        .filter((line) => line.section === section)
        .flatMap((line) => line.outputs);
    const columns = result.lines.find(
      (line) => line.section === 'Foundation' && line.kind === 'quote-columns',
    );
    expect(columns?.inputs.columns).toBe(14);
    const first = outputs('First Floor');
    expect(first.find((o) => o.material === 'kitchen_sink')?.quantity).toBe(2);
    expect(first.some((o) => o.name === 'Cement (tile bedding)')).toBe(true);
    expect(first.some((o) => o.material === 'labour_rcc')).toBe(true);
    expect(first.some((o) => o.material === 'labour_civil')).toBe(false);
    expect(
      outputs('Ground Floor').find((o) => o.material === 'rolling_shutter')
        ?.quantity,
    ).toBe(1);
    const external = outputs('External works');
    expect(external.find((o) => o.material === 'sump')?.quantity).toBe(6500);
    expect(external.find((o) => o.material === 'overhead_tank')?.quantity).toBe(
      1,
    );
  });

  it('keeps the frontage when a floor is quoted as parking + shop', () => {
    const details = calculateSftEstimate({
      rows: [
        {
          kind: 'floor',
          name: 'Ground Floor — Parking',
          lengthFeet: '44',
          widthFeet: '25',
          heightFeet: '10',
          ratePerSqft: '900',
        },
        {
          kind: 'floor',
          name: 'Ground Floor',
          lengthFeet: '17.5',
          widthFeet: '25',
          heightFeet: '10',
          ratePerSqft: '1380',
        },
      ],
      materialIds: [],
    });
    expect(floorsFromQuote(details)[0]).toMatchObject({
      name: 'Ground Floor',
      areaSqft: 1537.5,
      widthFeet: 25,
      lengthFeet: 61.5,
      parkingSqft: 1100,
    });
  });

  it('reads bars as written on the drawing', () => {
    expect(parseBars('4-16+2-12')).toEqual([
      { count: 4, dia: 16 },
      { count: 2, dia: 12 },
    ]);
    expect(parseBars('6 × 16')).toEqual([{ count: 6, dia: 16 }]);
    expect(parseBars('rings')).toEqual([]);
  });

  it('quantifies footings, column lifts and beams type by type from the drawing', () => {
    const column = (
      label: string,
      count: number,
      floors: number,
      bars: string,
      footing: number,
    ) => ({
      label,
      count,
      floors,
      widthIn: 9,
      depthIn: 15,
      bars,
      tieDia: 8,
      tieSpacingIn: 6,
      footingLengthFeet: footing,
      footingWidthFeet: footing,
      footingThicknessIn: 12,
      footingBarDia: 12,
      footingBarSpacingIn: 6,
    });
    const result = generateQuotationBoq({
      details: quote(),
      design: {
        columns: [
          column('C1–C4', 4, 0, '6-16', 5),
          column('C5–C6', 2, 1, '4-16+2-12', 4),
        ],
        beams: [
          {
            label: 'B1',
            widthIn: 9,
            depthIn: 15,
            bars: '4-20+2-16',
            stirrupDia: 8,
            stirrupSpacingIn: 6,
            runFeet: [80, 60],
          },
        ],
        plinthRunFeet: 200,
        settings: { slabDistSpacingIn: 6, coverMm: 25 },
      },
    });
    expect(result.design?.columns).toHaveLength(2);
    // The drawing's slab spacing and cover win over the company rules.
    expect(result.settings.slabDistSpacingIn).toBe(6);
    expect(result.settings.coverMm).toBe(25);
    const line = (section: string, kind: string) =>
      result.lines.find(
        (item) => item.section === section && item.kind === kind,
      )!;
    expect(line('Foundation', 'quote-foundation').name).toContain(
      '6 footings (4 × 5×5 ft, 2 × 4×4 ft)',
    );
    // Foundation lift: (4 × 6 + 2 × 4) 16 mm pieces, 2 per bar.
    const rods = (section: string, kind: string, diameter: number) =>
      line(section, kind).outputs.find(
        (output) => output.unit === 'rod' && output.diameter === diameter,
      )?.quantity;
    expect(rods('Foundation', 'quote-columns', 16)).toBe(16);
    expect(rods('Foundation', 'quote-columns', 12)).toBe(2);
    // C5–C6 stop below the first floor: only C1–C4 rise, 24 pieces, 3 per bar.
    expect(line('First Floor', 'quote-columns').inputs.columns).toBe(4);
    expect(rods('First Floor', 'quote-columns', 16)).toBe(8);
    expect(rods('First Floor', 'quote-columns', 12)).toBeUndefined();
    // B1 carries 20 mm bars; the plinth beam uses its own run.
    expect(rods('Ground Floor', 'quote-slab', 20)).toBeGreaterThan(0);
    expect(line('Foundation', 'quote-plinth-beam').inputs.beamRunFeet).toBe(
      200,
    );
  });

  it('carries the package rate from the quotation, never a fixed price', () => {
    const result = generateQuotationBoq({ details: quote() });
    const outputs = result.lines.flatMap((line) => line.outputs);
    expect(outputs.some((output) => output.rate !== undefined)).toBe(false);
    expect(outputs.find((output) => output.name === 'Main door')).toMatchObject(
      { material: 'door_main', quotedRate: 25000 },
    );
  });

  it('measures windows from the sizes on the plan', () => {
    expect(parseOpenings('2×4×4, 2 x 4 x 6; junk')).toEqual([
      { count: 2, widthFeet: 4, heightFeet: 4 },
      { count: 2, widthFeet: 4, heightFeet: 6 },
    ]);
    const result = generateQuotationBoq({
      details: quote(),
      counts: { windowSizes: { 'Ground Floor': '2×4×4, 2×4×6' } },
    });
    const windows = result.lines
      .find(
        (line) =>
          line.section === 'Ground Floor' &&
          line.kind === 'quote-doors-windows',
      )
      ?.outputs.find((output) => output.name === 'Windows');
    // 2 × 16 + 2 × 24 = 80 sq ft.
    expect(windows).toMatchObject({ quantity: 80, material: 'window' });
    expect(result.counts.windowSizes?.['Ground Floor']).toBe('2×4×4, 2×4×6');
  });

  it('prices structural labour as one contract rate per sq ft by default', () => {
    const result = generateQuotationBoq({ details: quote() });
    // The compound wall is outside the built-up contract rate.
    const outputs = result.lines
      .filter((line) => line.kind !== 'quote-compound-wall')
      .flatMap((line) => line.outputs);
    expect(
      outputs
        .filter((o) => o.material === 'labour_civil')
        .map((o) => o.quantity),
    ).toEqual([1200, 1200]);
    // Shuttering, brickwork and plaster are in that rate, not extra lines.
    expect(
      outputs.some((o) =>
        [
          'shuttering',
          'labour_rcc',
          'labour_brickwork_9',
          'plaster_labour',
        ].includes(o.material ?? ''),
      ),
    ).toBe(false);
  });

  it('prices RCC as ready-mix M20 per m³, or site mix when chosen', () => {
    const readyMix = generateQuotationBoq({ details: quote() });
    const slab = readyMix.lines.find((line) => line.kind === 'quote-slab')!;
    expect(slab.outputs[0]).toMatchObject({ material: 'concrete_m20' });
    expect(slab.outputs.some((o) => o.material === 'cement')).toBe(false);
    const siteMix = generateQuotationBoq({
      details: quote(),
      settings: { readyMixConcrete: 0 },
    });
    expect(
      siteMix.lines
        .find((line) => line.kind === 'quote-slab')!
        .outputs.some((o) => o.material === 'cement'),
    ).toBe(true);
  });

  it('tiles each room entered, with skirting, and says how many boxes to order', () => {
    const result = generateQuotationBoq({
      details: quote(),
      counts: {
        floors: { 'Ground Floor': { bathrooms: 2, kitchens: 1 } },
        finishes: {
          'Ground Floor': {
            rooms: [
              { name: 'Hall', lengthFeet: 12, widthFeet: 14 },
              { name: 'Bedroom', lengthFeet: 10, widthFeet: 12 },
            ],
            bathroomLengthFeet: 8,
            bathroomWidthFeet: 4,
            kitchenPlatformFeet: 12,
          },
        },
      },
    });
    const flooring = result.lines.find(
      (line) =>
        line.section === 'Ground Floor' && line.kind === 'quote-flooring',
    )!.outputs;
    // 168 + 120 = 288 sq ft + skirting (52 + 44 ft × 4 in = 32) = 320 × 1.05.
    const room = flooring.find((o) => o.name === 'Room flooring tiles')!;
    expect(room.quantity).toBe(336);
    // 336 sq ft of 2×2 ft tiles = 84 tiles, 21 boxes of 4.
    expect(room.order).toBe('84 tiles of 2×2 ft · 21 boxes of 4');
    // Bathrooms 8×4: floor 2 × 32 sq ft; walls 2 × (24 × 7 − 17.5).
    expect(
      flooring.find((o) => o.name === 'Bathroom floor tiles (anti-skid)')
        ?.quantity,
    ).toBe(67.2);
    expect(
      flooring.find((o) => o.name === 'Bathroom wall tiles')?.quantity,
    ).toBe(316.1);
    const kitchen = result.lines.find(
      (line) =>
        line.section === 'Ground Floor' && line.kind === 'quote-kitchen',
    )!.outputs;
    // 12 ft × 2 ft granite + 5%.
    expect(
      kitchen.find((o) => o.material === 'kitchen_platform')?.quantity,
    ).toBe(25.2);
    expect(result.counts.finishes?.['Ground Floor']?.rooms).toHaveLength(2);
  });

  it('itemizes electrical from the points on each floor', () => {
    const result = generateQuotationBoq({
      details: quote(),
      counts: {
        floors: {
          'Ground Floor': {
            lightPoints: 12,
            fanPoints: 4,
            socketPoints: 10,
            powerPoints: 5,
            kitchens: 1,
          },
        },
      },
    });
    const electrical = result.lines.find(
      (line) =>
        line.section === 'Ground Floor' && line.kind === 'quote-electrical',
    )!.outputs;
    const qty = (material: string) =>
      electrical.find((o) => o.material === material)?.quantity;
    // 16 light / fan points × 15 m = 240 m → 3 coils of 90 m.
    expect(qty('wire_15')).toBe(3);
    expect(qty('wire_25')).toBe(2);
    expect(qty('wire_40')).toBe(2);
    expect(qty('switch_6a')).toBe(26);
    expect(qty('socket_16a')).toBe(5);
    expect(qty('fan_regulator')).toBe(4);
    expect(qty('db_box')).toBe(1);
    expect(qty('labour_electrical')).toBe(31);
  });

  it('normalizes and clamps company settings', () => {
    const settings = normalizeStructuralSettings({
      stockBarFeet: '1000',
      foundationCuts: '2.6',
      lapDiameters: '',
    });
    expect(settings.stockBarFeet).toBe(60);
    expect(settings.foundationCuts).toBe(3);
    expect(settings.lapDiameters).toBe(
      DEFAULT_STRUCTURAL_SETTINGS.lapDiameters,
    );
  });
});

describe('contractual specification limits and manually entered BOQ measures', () => {
  it('keeps bathroom, parking, and room tile allowances separate', () => {
    const details = calculateSftEstimate({
      rows: [
        {
          kind: 'floor',
          name: 'Ground Floor',
          lengthFeet: '20',
          widthFeet: '30',
          heightFeet: '10.5',
          ratePerSqft: '1850',
        },
      ],
      materialIds: [],
      sections: [
        {
          title: 'Room flooring tiles',
          description: '',
          unit: 'sqft',
          pricingTreatment: 'allowance',
          allowanceValue: '80',
        },
        {
          title: 'Bathroom floor anti-skid tiles',
          description: '',
          unit: 'sqft',
          pricingTreatment: 'allowance',
          allowanceValue: '40',
        },
        {
          title: 'Parking area tiles',
          description: '',
          unit: 'sqft',
          pricingTreatment: 'allowance',
          allowanceValue: '45',
        },
        {
          title: 'SS304 staircase railing',
          description: '',
          unit: 'running_ft',
          pricingTreatment: 'allowance',
          allowanceValue: '1200',
        },
      ],
    });
    const initial = generateQuotationBoq({ details });
    const result = generateQuotationBoq({
      details,
      floors: initial.floors.map((floor) => ({ ...floor, parkingSqft: 200 })),
      counts: {
        ...initial.counts,
        finishes: {
          'Ground Floor': {
            rooms: [{ name: 'Bedroom', lengthFeet: 10, widthFeet: 12 }],
            bathroomLengthFeet: 7,
            bathroomWidthFeet: 5,
            kitchenPlatformFeet: 10,
            railingFeet: 36,
          },
        },
      },
    });
    const outputs = result.lines.flatMap((line) => line.outputs);
    const match = (name: string) =>
      outputs.find((output) => output.name === name);
    expect(match('Room flooring tiles')?.quotedRate).toBe(80);
    expect(match('Bathroom floor tiles (anti-skid)')?.quotedRate).toBe(40);
    expect(match('Parking tiles')?.quotedRate).toBe(45);
    expect(match('SS railing')).toMatchObject({
      quantity: 36,
      unit: 'running_ft',
      quotedRate: 1200,
    });
  });

  it('respects the first floor main-door price ceiling without changing other floors', () => {
    const base = quote();
    const details = {
      ...base,
      sections: [
        {
          title: 'Main door',
          description: 'Teak door',
          unit: 'door' as const,
          pricingTreatment: 'allowance' as const,
          allowanceValue: '45000',
        },
        {
          title: 'First Floor main door',
          description: 'Premium main door',
          unit: 'door' as const,
          pricingTreatment: 'allowance' as const,
          allowanceValue: '60000',
        },
      ],
    };
    const initial = generateQuotationBoq({ details });
    const result = generateQuotationBoq({
      details,
      counts: {
        ...initial.counts,
        floors: {
          ...initial.counts.floors,
          'First Floor': {
            ...initial.counts.floors['First Floor']!,
            mainDoors: 1,
          },
        },
      },
    });
    const main = (floor: string) =>
      result.lines
        .filter((line) => line.section === floor)
        .flatMap((line) => line.outputs)
        .find((output) => output.name === 'Main door');
    expect(main('Ground Floor')?.quotedRate).toBe(45000);
    expect(main('First Floor')?.quotedRate).toBe(60000);
  });
});
