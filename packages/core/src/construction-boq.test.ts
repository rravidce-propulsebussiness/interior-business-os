import { describe, expect, it } from 'vitest';
import {
  cutPlan,
  DEFAULT_STRUCTURAL_SETTINGS,
  floorsFromQuote,
  generateQuotationBoq,
  lapFeet,
  normalizeStructuralSettings,
  parseBars,
} from './construction-boq';
import { calculateSftEstimate } from './sft-quotation';

const quote = (heights: [string, string] = ['10', '10']) =>
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
      'Additional quoted works',
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
    // 85% of 1,200 sqft; the quoted ₹60 is kept only for comparison.
    expect(outputs('First Floor', 'quote-flooring')[0]).toEqual({
      name: 'Floor tiles',
      quantity: 1020,
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
    expect(services.some((o) => o.name === 'Plumbing pipes & fittings')).toBe(
      false,
    );
    expect(services.find((o) => o.name === 'Plumbing labour')).toMatchObject({
      quantity: 3,
      material: 'labour_plumbing',
    });
    expect(
      result.lines.some((line) => line.origin === 'quotation-allowance'),
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
    const result = generateQuotationBoq({ details: quote() });
    const wall = result.lines.find((line) => line.name === 'Compound wall');
    expect(wall).toMatchObject({
      origin: 'quotation-additional',
      quotedPrice: 126000,
    });
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
    // 20 × 15 in × 15 in × 2 ft = 62.5 cft ≈ 1.77 m³
    expect(pedestals?.outputs[0]?.quantity).toBeCloseTo(1.77, 2);
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
      },
    });
    expect(result.design?.columns).toHaveLength(2);
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

  it('never prices the BOQ from the customer quotation', () => {
    const result = generateQuotationBoq({ details: quote() });
    const outputs = result.lines.flatMap((line) => line.outputs);
    expect(outputs.some((output) => output.rate !== undefined)).toBe(false);
    expect(outputs.find((output) => output.name === 'Main door')).toMatchObject(
      { material: 'door_main', quotedRate: 25000 },
    );
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
