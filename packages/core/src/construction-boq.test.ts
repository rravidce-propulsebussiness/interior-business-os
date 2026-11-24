import { describe, expect, it } from 'vitest';
import {
  cutPlan,
  DEFAULT_STRUCTURAL_SETTINGS,
  floorsFromQuote,
  generateQuotationBoq,
  lapFeet,
  normalizeStructuralSettings,
  normalizeDesign,
  parseBars,
  parseFeet,
  parseOpenings,
  parseSizes,
  plasterMaterialTakeoff,
} from './construction-boq';
import { calculateSftEstimate } from './sft-quotation';
import {
  footingConcreteCft,
  footingMeshPieces,
  barsAcross,
  newFootingType,
} from './footing-takeoff';

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
    // External plaster needs frame scaffolding over the same face area.
    expect(
      wall?.outputs.find(
        (output) => output.name === 'Scaffolding (external plaster)',
      ),
    ).toMatchObject({ quantity: 1680, material: 'scaffolding', unit: 'sqft' });
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

  it('quantifies multiple plinth beam types and up to four different main bar diameters without a second legacy run', () => {
    const result = generateQuotationBoq({
      details: quote(),
      design: {
        footings: [],
        columns: [],
        beams: [],
        // This older length must be ignored after a PB1/PB2 schedule is supplied.
        plinthRunFeet: 999,
        plinthBeams: [
          {
            label: 'PB1',
            count: 2,
            lengthFeet: 15,
            widthIn: 9,
            depthIn: 12,
            bars: '4-16+2-12',
            stirrupDia: 8,
            stirrupSpacingIn: 6,
          },
          {
            label: 'PB2',
            count: 1,
            lengthFeet: 22,
            widthIn: 12,
            depthIn: 15,
            bars: '2-20+4-16+2-10',
            stirrupDia: 8,
            stirrupSpacingIn: 4,
          },
        ],
      },
    });
    const plinth = result.lines.find(
      (line) =>
        line.section === 'Foundation' && line.kind === 'quote-plinth-beam',
    )!;
    expect(plinth).toBeDefined();
    expect(plinth.inputs.beamRunFeet).toBe(52);
    expect(String(plinth.inputs.beam)).toContain('PB1 9×12 in');
    expect(String(plinth.inputs.beam)).toContain('PB2 12×15 in');
    const concrete = plinth.outputs.find((output) => output.unit === 'm³')!;
    // 2×15ft of 9in×12in + 22ft of 12in×15in = 50 cft of concrete.
    expect(concrete.quantity).toBeCloseTo(
      50 * 0.028316846592 * (1 + result.settings.materialWastagePercent / 100),
      2,
    );
    for (const diameter of [8, 10, 12, 16, 20]) {
      expect(
        plinth.outputs.find(
          (output) => output.unit === 'rod' && output.diameter === diameter,
        )?.quantity,
      ).toBeGreaterThan(0);
    }
    expect(result.design?.plinthBeams).toHaveLength(2);
  });

  it('retains unfinished plinth rows on normalization and never charges the legacy grid twice', () => {
    const complete = normalizeDesign({
      footings: [],
      columns: [],
      beams: [],
      plinthRunFeet: 120,
      plinthBeams: [
        {
          label: 'PB1',
          count: 3,
          lengthFeet: 0,
          widthIn: 9,
          depthIn: 12,
          bars: '4-16+2-12',
          stirrupDia: 8,
          stirrupSpacingIn: 6,
        },
      ],
    });
    expect(complete?.plinthBeams).toHaveLength(1);
    expect(complete?.plinthBeams?.[0]?.lengthFeet).toBe(0);
    const boq = generateQuotationBoq({ details: quote(), design: complete });
    expect(
      boq.lines.find((line) => line.kind === 'quote-plinth-beam'),
    ).toBeUndefined();
  });

  it('carries the package rate from the quotation, never a fixed price', () => {
    const result = generateQuotationBoq({ details: quote() });
    const outputs = result.lines.flatMap((line) => line.outputs);
    // Informational volume references may carry an explicit zero rate.
    expect(
      outputs.some((output) => output.rate !== undefined && output.rate !== 0),
    ).toBe(false);
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
    const siteSlab = siteMix.lines.find((line) => line.kind === 'quote-slab')!;
    const volume = siteSlab.outputs.find((o) => o.unit === 'm³');
    expect(volume).toMatchObject({ rate: 0 });
    expect(siteSlab.outputs.some((o) => o.material === 'concrete_m20')).toBe(
      false,
    );
    for (const material of ['cement', 'sand', 'aggregate'])
      expect(siteSlab.outputs.some((o) => o.material === material)).toBe(true);
    // The structural switch does not change the PCC constituent materials.
    const pccMaterials = (result: typeof readyMix) =>
      result.lines
        .flatMap((line) =>
          line.kind === 'quote-pcc'
            ? line.outputs.filter((o) =>
                ['cement', 'sand', 'aggregate'].includes(o.material ?? ''),
              )
            : [],
        )
        .map((o) => [o.material, o.quantity]);
    expect(pccMaterials(siteMix)).toEqual(pccMaterials(readyMix));
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

  it('preserves Royal package finishes and warns when procurement input is missing', () => {
    const details = calculateSftEstimate({
      rows: [
        {
          kind: 'floor',
          name: 'Ground Floor',
          lengthFeet: '20',
          widthFeet: '30',
          heightFeet: '11',
          ratePerSqft: '2050',
        },
      ],
      materialIds: [],
      sections: [
        {
          title: 'Parking area granite flooring',
          description: 'Granite flooring',
          unit: 'sqft',
          pricingTreatment: 'allowance',
          allowanceValue: '70',
        },
        {
          title: 'Interior painting',
          description:
            'Birla putty 2 coats; Royal Emulsion 3 coats; primer 1 coat',
          unit: 'none',
          pricingTreatment: 'included',
        },
        {
          title: 'Bathroom wall tiles',
          description: 'Tiles up to ceiling height',
          unit: 'sqft',
          pricingTreatment: 'allowance',
          allowanceValue: '65',
        },
      ],
    });
    const initial = generateQuotationBoq({ details });
    const result = generateQuotationBoq({
      details,
      floors: initial.floors.map((floor) => ({ ...floor, parkingSqft: 100 })),
      counts: {
        ...initial.counts,
        floors: {
          ...initial.counts.floors,
          'Ground Floor': {
            ...initial.counts.floors['Ground Floor']!,
            bathrooms: 1,
          },
        },
      },
    });
    const outputs = result.lines.flatMap((line) => line.outputs);
    const parking = outputs.find(
      (output) => output.name === 'Parking granite flooring',
    );
    expect(parking).toMatchObject({
      material: 'parking_flooring',
      quotedRate: 70,
    });
    expect(parking?.source).toContain('Granite');
    expect(
      outputs.some(
        (output) =>
          output.name === 'Interior painting (putty, primer, 3 coats)',
      ),
    ).toBe(true);
    expect(
      outputs.find((output) => output.name === 'Bathroom wall tiles')?.source,
    ).toContain('ceiling-height');
  });
});

describe('entering the drawings by hand', () => {
  it('reads lengths as written on drawings, never guessing', () => {
    expect(parseFeet('11.25')).toBe(11.25);
    expect(parseFeet(`11'3"`)).toBe(11.25);
    expect(parseFeet(`11'3`)).toBe(11.25);
    expect(parseFeet(`11' 3"`)).toBe(11.25);
    expect(parseFeet(`11'-3"`)).toBe(11.25);
    expect(parseFeet('11-3')).toBe(11.25);
    expect(parseFeet('11ft 3in')).toBe(11.25);
    expect(parseFeet(`7'0"`)).toBe(7);
    expect(parseFeet(`5'`)).toBe(5);
    expect(parseFeet('9"')).toBe(0.75);
    expect(parseFeet('11’8”')).toBeCloseTo(11.6667, 3);
    // Not lengths: never read as 113 or 70 ft.
    expect(parseFeet(`11'13"`)).toBeNull();
    expect(parseFeet('abc')).toBeNull();
    expect(parseFeet('')).toBeNull();
  });

  it('reads one size per bathroom and window sizes in feet-inches', () => {
    expect(parseSizes(`7'0x6'9, 4'6×6'0, 2×6x5`)).toEqual([
      { lengthFeet: 7, widthFeet: 6.75 },
      { lengthFeet: 4.5, widthFeet: 6 },
      { lengthFeet: 6, widthFeet: 5 },
      { lengthFeet: 6, widthFeet: 5 },
    ]);
    expect(parseSizes('nonsense, 8x')).toEqual([]);
    expect(parseOpenings(`2×4'6"×4, 1 nos x 3 x 2`)).toEqual([
      { count: 2, widthFeet: 4.5, heightFeet: 4 },
      { count: 1, widthFeet: 3, heightFeet: 2 },
    ]);
    // Existing plain entries still read the same.
    expect(parseOpenings('2×4×4, 2*4*6')).toEqual([
      { count: 2, widthFeet: 4, heightFeet: 4 },
      { count: 2, widthFeet: 4, heightFeet: 6 },
    ]);
  });

  it('tiles and waterproofs each bathroom at its own size', () => {
    const run = (finishes: Record<string, unknown>, bathrooms = 2) =>
      generateQuotationBoq({
        details: quote(),
        counts: {
          floors: { 'Ground Floor': { bathrooms } },
          finishes: { 'Ground Floor': { rooms: [], ...finishes } },
        },
      });
    const output = (
      result: ReturnType<typeof generateQuotationBoq>,
      name: string,
    ) =>
      result.lines
        .filter((line) => line.section === 'Ground Floor')
        .flatMap((line) => line.outputs)
        .find((item) => item.name === name)!;
    const each = run({ bathroomSizes: `8'0x4'0, 6'0x5'0` });
    // Floors 32 + 30 = 62 sq ft, + 5% = 65.1.
    expect(
      output(each, 'Bathroom floor tiles (anti-skid)').quantity,
    ).toBeCloseTo(65.1, 1);
    // Walls (24 + 22) × 7 − 2 × 17.5 = 287, + 5%.
    expect(output(each, 'Bathroom wall tiles').quantity).toBeCloseTo(301.4, 1);
    // Waterproofing: (32 + 24) + (30 + 22).
    expect(output(each, 'Bathroom waterproofing').quantity).toBe(108);
    expect(output(each, 'Bathroom waterproofing').source).toContain(
      '8×4 + 6×5 ft',
    );
    expect(each.warnings.join(' ')).not.toContain('bathroom sizes');
    // A typical size only: the same as before.
    const typical = run({ bathroomLengthFeet: 8, bathroomWidthFeet: 4 });
    expect(
      output(typical, 'Bathroom floor tiles (anti-skid)').quantity,
    ).toBeCloseTo(67.2, 1);
    // More bathrooms than sizes: the rest use the typical size; warned.
    const short = run(
      {
        bathroomSizes: `8'0x4'0, 6'0x5'0`,
        bathroomLengthFeet: 7,
        bathroomWidthFeet: 5,
      },
      3,
    );
    expect(output(short, 'Bathroom waterproofing').quantity).toBe(108 + 59);
    expect(short.warnings.join(' ')).toContain(
      '2 bathroom sizes entered for 3 bathrooms',
    );
  });

  it('warns when window sizes and the window count disagree', () => {
    const result = generateQuotationBoq({
      details: quote(),
      counts: {
        floors: { 'Ground Floor': { windows: 6 } },
        windowSizes: { 'Ground Floor': '2×4×4, 2×4×6' },
      },
    });
    expect(result.warnings.join(' ')).toContain(
      'Ground Floor: window sizes list 4 windows; the count says 6.',
    );
  });

  it("uses each element's cover, the drawing's stair riser and tread, and plinth stirrups", () => {
    const design = (settings: Record<string, number>) => ({
      columns: [
        {
          label: 'C1',
          count: 4,
          floors: 0,
          widthIn: 9,
          depthIn: 15,
          bars: '6-16',
          tieDia: 8,
          tieSpacingIn: 6,
          footingLengthFeet: 5,
          footingWidthFeet: 5,
          footingThicknessIn: 12,
          footingBarDia: 12,
          footingBarSpacingIn: 6,
        },
      ],
      beams: [],
      plinthRunFeet: 100,
      settings: { coverMm: 25, ...settings },
    });
    const rods = (
      result: ReturnType<typeof generateQuotationBoq>,
      section: string,
      kind: string,
      diameter: number,
    ) =>
      result.lines
        .find((line) => line.section === section && line.kind === kind)!
        .outputs.find(
          (item) => item.unit === 'rod' && item.diameter === diameter,
        )?.quantity ?? 0;
    const base = generateQuotationBoq({ details: quote(), design: design({}) });
    // Blank covers keep today's result.
    const same = generateQuotationBoq({
      details: quote(),
      design: design({ coverFootingMm: 0, coverColumnMm: 0 }),
    });
    const withoutIds = (result: ReturnType<typeof generateQuotationBoq>) =>
      result.lines.map((line) => ({ ...line, id: '' }));
    expect(withoutIds(same)).toEqual(withoutIds(base));
    // A thinner column cover makes longer rings.
    const thin = generateQuotationBoq({
      details: quote(),
      design: design({ coverColumnMm: 20 }),
    });
    expect(thin.settings.coverColumnMm).toBe(20);
    expect(
      rods(thin, 'First Floor', 'quote-columns', 8),
    ).toBeGreaterThanOrEqual(rods(base, 'First Floor', 'quote-columns', 8));
    // Riser 6 in / tread 11 in: 20 risers on a 10 ft floor, longer flights.
    const stair = (settings: Record<string, number>) =>
      generateQuotationBoq({
        details: quote(),
        design: design(settings),
      }).lines.find(
        (line) =>
          line.section === 'Ground Floor' && line.kind === 'quote-staircase',
      )!;
    expect(stair({}).inputs.risers).toBe(20);
    expect(stair({ stairRiserIn: 7 }).inputs.risers).toBe(18);
    const concrete = (settings: Record<string, number>) =>
      stair(settings).outputs.find((item) => item.unit === 'm³')!.quantity;
    expect(concrete({ stairTreadIn: 11 })).toBeGreaterThan(concrete({}));
    // Plinth beam stirrups from the drawing, else the beam stirrups.
    const plinth = (settings: Record<string, number>) =>
      rods(
        generateQuotationBoq({ details: quote(), design: design(settings) }),
        'Foundation',
        'quote-plinth-beam',
        8,
      );
    expect(plinth({ plinthBeamStirrupSpacingIn: 4 })).toBeGreaterThan(
      plinth({}),
    );
  });

  it('splits roof beam and slab measurements without losing or duplicating concrete and reinforcement', () => {
    const design = {
      columns: [
        {
          label: 'C1',
          count: 4,
          floors: 0,
          widthIn: 9,
          depthIn: 12,
          bars: '4-16+2-12',
          tieDia: 8,
          tieSpacingIn: 6,
          footingLengthFeet: 5,
          footingWidthFeet: 5,
          footingThicknessIn: 12,
          footingBarDia: 12,
          footingBarSpacingIn: 6,
        },
      ],
      beams: [
        {
          label: 'B1',
          widthIn: 9,
          depthIn: 15,
          bars: '2-16+2-12',
          stirrupDia: 8,
          stirrupSpacingIn: 6,
          runFeet: [80, 70],
        },
      ],
      plinthRunFeet: 120,
      settings: {
        slabThicknessIn: 5,
        slabMainDia: 10,
        slabMainSpacingIn: 6,
        slabDistDia: 8,
        slabDistSpacingIn: 8,
      },
    };
    const legacy = generateQuotationBoq({ details: quote(), design });
    const separated = generateQuotationBoq({
      details: quote(),
      design,
      splitBeamSlab: true,
    });
    const concreteVolume = (items: typeof legacy.lines) =>
      items
        .flatMap((item) => item.outputs)
        .filter((output) => output.unit === 'm³')
        .reduce((sum, output) => sum + output.quantity, 0);
    const rods = (items: typeof legacy.lines) =>
      items
        .flatMap((item) => item.outputs)
        .filter((output) => output.unit === 'rod')
        .reduce((sum, output) => sum + output.quantity, 0);

    for (const section of ['Ground Floor', 'First Floor']) {
      const original = legacy.lines.filter(
        (item) => item.section === section && item.kind === 'quote-slab',
      );
      const beams = separated.lines.filter(
        (item) => item.section === section && item.kind === 'quote-beams',
      );
      const slabs = separated.lines.filter(
        (item) => item.section === section && item.kind === 'quote-slab',
      );
      expect(original).toHaveLength(1);
      expect(beams).toHaveLength(1);
      expect(slabs).toHaveLength(1);
      // Concrete rounding happens once per material line, so allow 0.02 m³.
      expect(concreteVolume([...beams, ...slabs])).toBeCloseTo(
        concreteVolume(original),
        1,
      );
      expect(rods([...beams, ...slabs])).toBe(rods(original));
      expect(slabs[0]!.name).not.toContain('beams');
      expect(beams[0]!.name).toContain('beams');
    }
    expect(separated.steel).toEqual(legacy.steel);
  });

  it('prices structural labour on the exact built-up area', () => {
    const result = generateQuotationBoq({
      details: quote(),
      floors: [
        {
          name: 'Ground Floor',
          areaSqft: 1537.5,
          lengthFeet: 61.5,
          widthFeet: 25,
          heightFeet: 10,
        },
      ],
    });
    const labour = result.lines
      .flatMap((line) => line.outputs)
      .find((item) => item.material === 'labour_civil');
    expect(labour?.quantity).toBe(1537.5);
  });

  it('deducts exact openings from measured external/internal walls and applies editable material thumb rules', () => {
    const measuredCounts = {
      floors: {
        'Ground Floor': {
          mainDoors: 1,
          internalDoors: 1,
          bathroomDoors: 0,
          poojaDoors: 0,
          windows: 2,
          ventilators: 0,
          rollingShutters: 0,
        },
      },
      walls: {
        'Ground Floor': [
          {
            id: 'ext',
            name: 'External 9 in',
            location: 'external',
            count: 4,
            lengthFeet: 20,
            heightFeet: 10,
            thicknessIn: 9,
          },
          {
            id: 'int',
            name: 'Room partition 4.5 in',
            location: 'internal',
            count: 2,
            lengthFeet: 10,
            heightFeet: 10,
            thicknessIn: 4.5,
          },
        ],
      },
      windowSizes: { 'Ground Floor': '2×4×4' },
      doorSizes: {
        'Ground Floor': {
          mainDoors: '1×3.5×7',
          internalDoors: '1×3×7',
        },
      },
    };
    const result = generateQuotationBoq({
      details: quote(),
      counts: measuredCounts,
      splitBeamSlab: true,
    });
    const masonry = result.lines.find(
      (line) =>
        line.section === 'Ground Floor' && line.kind === 'quote-masonry',
    )!;
    const opening = masonry.inputs.openings;
    expect(String(opening)).toContain('77.5 sqft');
    const outer = masonry.outputs.find((item) =>
      item.name.includes('External 9 in'),
    )!;
    const inner = masonry.outputs.find((item) =>
      item.name.includes('Room partition'),
    )!;
    // External gross: 4×20×10=800; main door 24.5 + windows 32.
    expect(outer.quantity).toBe(744);
    // Internal gross: 2×10×10=200; room door 21.
    expect(inner.quantity).toBeCloseTo(179, 0);
    const bricks = masonry.outputs.find((item) => item.material === 'bricks')!;
    expect(bricks.quantity).toBe(8580);
    const cement = masonry.outputs.find(
      (item) => item.name === 'Cement (brickwork)',
    )!;
    expect(cement.quantity).toBeCloseTo(51.5, 1);
    expect(
      masonry.outputs.some((item) => item.name === 'Cement (plaster)'),
    ).toBe(true);
    expect(
      masonry.outputs.some((item) => item.name === 'Sand (brickwork)'),
    ).toBe(true);

    const changed = generateQuotationBoq({
      details: quote(),
      counts: {
        ...measuredCounts,
        doorSizes: {
          'Ground Floor': {
            mainDoors: '1×4×7',
            internalDoors: '1×3×7',
          },
        },
      },
      splitBeamSlab: true,
    }).lines.find(
      (line) =>
        line.section === 'Ground Floor' && line.kind === 'quote-masonry',
    )!;
    expect(
      changed.outputs.find((item) => item.material === 'bricks')!.quantity,
    ).toBeLessThan(bricks.quantity);
  });

  it('calculates single and double coat plaster material from wall-face area', () => {
    const single = plasterMaterialTakeoff(1000, 500, 1, 1, 5);
    const double = plasterMaterialTakeoff(1000, 500, 2, 2, 5);
    expect(single.cementBags).toBeCloseTo(
      (1000 * 0.0058 + 500 * 0.0136) * 1.05,
      6,
    );
    expect(double.cementBags).toBeGreaterThan(single.cementBags);
    expect(double.sandM3).toBeGreaterThan(single.sandM3);
    expect(plasterMaterialTakeoff(0, 0, 2, 2, 5).cementBags).toBe(0);
  });

  it('generates measured plaster cement and sand directly from wall sizes and coat counts', () => {
    const walls = [
      {
        id: 'outer',
        name: 'Outside',
        location: 'external' as const,
        count: 4,
        lengthFeet: 30,
        heightFeet: 10,
        thicknessIn: 9,
      },
      {
        id: 'inner',
        name: 'Inside',
        location: 'internal' as const,
        count: 3,
        lengthFeet: 20,
        heightFeet: 10,
        thicknessIn: 4.5,
      },
    ];
    const counts = {
      floors: {
        'Ground Floor': {
          mainDoors: 0,
          internalDoors: 0,
          bathroomDoors: 0,
          poojaDoors: 0,
          windows: 0,
          ventilators: 0,
          bathrooms: 0,
          kitchens: 0,
          rollingShutters: 0,
          lightPoints: 0,
          fanPoints: 0,
          socketPoints: 0,
          powerPoints: 0,
        },
      },
      walls: { 'Ground Floor': walls },
      finishes: {
        'Ground Floor': {
          rooms: [],
          bathroomLengthFeet: 0,
          bathroomWidthFeet: 0,
          kitchenPlatformFeet: 0,
          internalPlasterCoats: 2 as const,
          externalPlasterCoats: 1 as const,
          tileWastagePercent: 12,
        },
      },
      entranceGates: 0,
      compoundWallFeet: 0,
    };
    const result = generateQuotationBoq({
      details: quote(),
      counts,
      splitBeamSlab: true,
      settings: { ...DEFAULT_STRUCTURAL_SETTINGS, labourItemized: 1 },
    });
    const masonry = result.lines.find(
      (line) =>
        line.section === 'Ground Floor' && line.kind === 'quote-masonry',
    )!;
    const cement = masonry.outputs.find((o) => o.name === 'Cement (plaster)')!;
    const sand = masonry.outputs.find((o) => o.name === 'Sand (plaster)')!;
    // External 1,200 sqft, both faces of 600 sqft internal, no openings.
    const expected = plasterMaterialTakeoff(
      2400,
      1200,
      2,
      1,
      DEFAULT_STRUCTURAL_SETTINGS.materialWastagePercent,
    );
    expect(cement.quantity).toBeCloseTo(expected.cementBags, 1);
    expect(sand.quantity).toBeGreaterThan(0);
    expect(
      masonry.outputs.find((o) => o.name === 'Internal plaster second coat')
        ?.quantity,
    ).toBe(2400);
    const single = generateQuotationBoq({
      details: quote(),
      counts: {
        ...counts,
        finishes: {
          'Ground Floor': {
            ...counts.finishes['Ground Floor'],
            internalPlasterCoats: 1 as const,
          },
        },
      },
      splitBeamSlab: true,
      settings: { ...DEFAULT_STRUCTURAL_SETTINGS, labourItemized: 1 },
    }).lines.find(
      (line) =>
        line.section === 'Ground Floor' && line.kind === 'quote-masonry',
    )!;
    expect(
      single.outputs.find((o) => o.name === 'Cement (plaster)')!.quantity,
    ).toBeLessThan(cement.quantity);
    expect(
      single.outputs.some((o) => o.name === 'Internal plaster second coat'),
    ).toBe(false);
  });

  it('derives one sunshade per measured window with no guessed window dimensions', () => {
    const result = generateQuotationBoq({
      details: quote(),
      counts: {
        windowSizes: { 'Ground Floor': '2×4×4, 1×3×4' },
      },
      splitBeamSlab: true,
    });
    const shades = result.lines.filter(
      (line) => line.kind === 'quote-window-sajjas',
    );
    expect(shades).toHaveLength(1);
    expect(shades[0]?.section).toBe('Ground Floor');
    expect(shades[0]?.inputs.windowCount).toBe(3);
    expect(
      shades[0]?.outputs.some((output) => output.material === 'concrete_m20'),
    ).toBe(false);
    expect(
      shades[0]?.outputs.find(
        (output) => output.name === 'Cement (window sunshades)',
      )?.quantity,
    ).toBeGreaterThan(0);
    expect(
      shades[0]?.outputs.find((output) => output.material === 'steel')
        ?.diameter,
    ).toBe(8);
    expect(
      shades[0]?.outputs.find((output) => output.material === 'shuttering')
        ?.quantity,
    ).toBeGreaterThan(0);
    expect(
      shades[0]?.outputs.find((output) => output.unit === 'm³')?.rate,
    ).toBe(0);
    const withoutSizes = generateQuotationBoq({
      details: quote(),
      splitBeamSlab: true,
    });
    expect(
      withoutSizes.lines.some((line) => line.kind === 'quote-window-sajjas'),
    ).toBe(false);
    expect(withoutSizes.warnings.join(' ')).toContain('sunshade');
  });

  it('measures independent F1 footing schedule without inventing columns', () => {
    const footing = {
      ...newFootingType(0),
      count: 4,
      columnRefs: 'C1, C2',
      lengthFeet: 5,
      widthFeet: 5,
      thicknessIn: 12,
      bottomBarDia: 12,
      bottomSpacingIn: 6,
    };
    const result = generateQuotationBoq({
      details: quote(),
      design: { footings: [footing], columns: [], beams: [], plinthRunFeet: 0 },
      splitBeamSlab: true,
    });
    const measured = result.lines.find((row) => row.kind === 'quote-footings');
    expect(result.design?.footings).toHaveLength(1);
    expect(measured?.inputs).toMatchObject({
      footingRef: 'F1',
      count: 4,
      pads: 4,
      reinforcement: 'single',
      supportedColumns: 'C1, C2',
    });
    expect(measured?.outputs.some((output) => output.unit === 'rod')).toBe(
      true,
    );
    expect(result.lines.some((row) => row.kind === 'quote-columns')).toBe(
      false,
    );
    expect(result.lines.some((row) => row.kind === 'quote-foundation')).toBe(
      false,
    );
    expect(result.warnings.join(' ')).toContain('C1');
  });

  it('counts separate top and bottom meshes without double-counting concrete', () => {
    const footing = {
      ...newFootingType(0),
      count: 2,
      lengthFeet: 5,
      widthFeet: 6,
      thicknessIn: 12,
      mesh: 'single' as const,
    };
    const one = generateQuotationBoq({
      details: quote(),
      design: { footings: [footing], columns: [], beams: [], plinthRunFeet: 0 },
      splitBeamSlab: true,
    });
    const two = generateQuotationBoq({
      details: quote(),
      design: {
        footings: [
          { ...footing, mesh: 'double', topBarDia: 16, topSpacingIn: 6 },
        ],
        columns: [],
        beams: [],
        plinthRunFeet: 0,
      },
      splitBeamSlab: true,
    });
    const outputs = (r: typeof one) =>
      r.lines.find((row) => row.kind === 'quote-footings')!.outputs;
    const concrete = (r: typeof one) =>
      outputs(r).find((output) => output.material === 'concrete_m20')!.quantity;
    const rods = (r: typeof one) =>
      outputs(r)
        .filter((output) => output.unit === 'rod')
        .reduce((sum, output) => sum + output.quantity, 0);
    expect(concrete(one)).toBe(concrete(two));
    expect(rods(two)).toBeGreaterThan(rods(one));
    expect(outputs(two).some((output) => output.diameter === 16)).toBe(true);
  });

  it('quantifies a footing pedestal separately from column main bars', () => {
    const footing = {
      ...newFootingType(0),
      type: 'combined' as const,
      count: 1,
      columnRefs: 'C1, C2',
      lengthFeet: 8,
      widthFeet: 5,
      thicknessIn: 15,
      pedestal: true,
      pedestalsPerGroup: 2,
      pedestalWidthIn: 15,
      pedestalDepthIn: 15,
      pedestalHeightFeet: 2,
      pedestalTieDia: 8,
      pedestalTieSpacingIn: 6,
    };
    const result = generateQuotationBoq({
      details: quote(),
      design: { footings: [footing], columns: [], beams: [], plinthRunFeet: 0 },
      splitBeamSlab: true,
    });
    const pedestal = result.lines.find((row) => row.kind === 'quote-pedestals');
    expect(pedestal?.inputs).toMatchObject({ footingRef: 'F1', pedestals: 2 });
    expect(
      pedestal?.outputs.some((output) =>
        output.name.includes('Pedestal concrete'),
      ),
    ).toBe(true);
    expect(result.lines.some((row) => row.kind === 'quote-columns')).toBe(
      false,
    );
  });

  it('supports six foundation configurations and distinct sloped/stepped geometries', () => {
    const footing = {
      ...newFootingType(0),
      count: 1,
      lengthFeet: 6,
      widthFeet: 5,
      thicknessIn: 15,
    };
    const flat = footingConcreteCft(footing);
    const stepped = footingConcreteCft({
      ...footing,
      geometry: 'stepped',
      topLengthFeet: 4,
      topWidthFeet: 3,
      stepThicknessIn: 6,
    });
    const sloped = footingConcreteCft({
      ...footing,
      geometry: 'sloped',
      edgeThicknessIn: 6,
      topLengthFeet: 3,
      topWidthFeet: 2,
    });
    expect(stepped).toBeGreaterThan(flat);
    expect(sloped).toBeLessThan(flat);
    expect(
      footingMeshPieces({ ...footing, mesh: 'double' }, 0.15),
    ).toHaveLength(4);
    for (const type of [
      'isolated',
      'combined',
      'strap',
      'raft',
      'strip',
      'pile_cap',
    ] as const) {
      const result = generateQuotationBoq({
        details: quote(),
        design: {
          footings: [
            {
              ...footing,
              type,
              ...(type === 'strap'
                ? {
                    padsPerGroup: 2,
                    strapLengthFeet: 5,
                    strapWidthIn: 9,
                    strapDepthIn: 12,
                  }
                : {}),
            },
          ],
          columns: [],
          beams: [],
          plinthRunFeet: 0,
        },
        splitBeamSlab: true,
      });
      expect(result.lines.some((line) => line.kind === 'quote-footings')).toBe(
        true,
      );
      if (type === 'pile_cap')
        expect(result.warnings.join(' ')).toContain('excludes piles');
    }
  });

  it('preserves original estimate mode when no measured wall schedule is present', () => {
    const result = generateQuotationBoq({ details: quote() });
    const masonry = result.lines.find((line) => line.kind === 'quote-masonry')!;
    expect(
      masonry.outputs.find(
        (output) => output.name === 'Cement (brickwork & plaster)',
      ),
    ).toBeTruthy();
    expect(
      masonry.outputs.find((output) => output.name === 'Cement (brickwork)'),
    ).toBeUndefined();
  });
});

describe('floor-specific kitchens, finish exclusions and staircase measurements', () => {
  it('prices two independently measured kitchens and permits no room flooring or stairs', () => {
    const base = generateQuotationBoq({ details: quote() });
    const groundCounts = base.counts.floors['Ground Floor']!;
    const result = generateQuotationBoq({
      details: quote(),
      counts: {
        floors: {
          'Ground Floor': { ...groundCounts, kitchens: 2 },
        },
        finishes: {
          'Ground Floor': {
            rooms: [],
            excludeRoomFlooring: true,
            bathroomLengthFeet: 0,
            bathroomWidthFeet: 0,
            kitchenPlatformFeet: 0,
            staircaseGraniteSqft: 0,
            railingFeet: 35,
            kitchenMeasurements: [
              {
                id: 'k1',
                name: 'Kitchen A',
                platformFeet: 3,
                platformDepthFeet: 2,
                wallTileFeet: 3,
                wallTileHeightFeet: 2,
              },
              {
                id: 'k2',
                name: 'Kitchen B',
                platformFeet: 5,
                platformDepthFeet: 2.5,
                wallTileFeet: 5,
                wallTileHeightFeet: 3,
              },
            ],
          },
        },
      },
    });
    const outputs = (kind: string) =>
      result.lines
        .filter((line) => line.kind === kind && line.section === 'Ground Floor')
        .flatMap((line) => line.outputs);
    const byMaterial = (kind: string, material: string) =>
      outputs(kind).find((row) => row.material === material)?.quantity ?? 0;
    expect(byMaterial('quote-kitchen', 'kitchen_platform')).toBeCloseTo(
      (3 * 2 + 5 * 2.5) * (1 + result.settings.tileWastagePercent / 100),
      1,
    );
    expect(byMaterial('quote-kitchen', 'kitchen_sink')).toBe(2);
    expect(byMaterial('quote-kitchen', 'kitchen_wall_tiles')).toBeGreaterThan(
      21,
    );
    expect(byMaterial('quote-flooring', 'floor_tiles')).toBe(0);
    expect(byMaterial('quote-flooring', 'staircase_granite')).toBe(0);
    expect(byMaterial('quote-railings', 'railing_ss304')).toBe(35);
  });

  it('removes all kitchen and sink quantities on a floor without a kitchen', () => {
    const result = generateQuotationBoq({
      details: quote(),
      counts: {
        floors: { 'Ground Floor': { kitchens: 0 } },
        finishes: {
          'Ground Floor': {
            rooms: [],
            kitchenMeasurements: [],
            bathroomLengthFeet: 0,
            bathroomWidthFeet: 0,
            kitchenPlatformFeet: 0,
          },
        },
      },
    });
    const outputs = result.lines
      .filter((line) => line.section === 'Ground Floor')
      .flatMap((line) => line.outputs);
    expect(
      outputs.some(
        (row) => row.material === 'kitchen_platform' && row.quantity > 0,
      ),
    ).toBe(false);
    expect(
      outputs.some(
        (row) => row.material === 'kitchen_sink' && row.quantity > 0,
      ),
    ).toBe(false);
    expect(
      result.counts.finishes?.['Ground Floor']?.kitchenMeasurements,
    ).toEqual([]);
  });

  it('recognizes penthouse quotation area separately for repeat exclusions', () => {
    const details = quote(
      ['10', '10'],
      [
        {
          kind: 'floor',
          name: 'Terrace — Penthouse',
          lengthFeet: '15',
          widthFeet: '20',
          heightFeet: '10',
          ratePerSqft: '1850',
        },
      ],
    );
    expect(
      floorsFromQuote(details).find((floor) => floor.name === 'Terrace'),
    ).toMatchObject({ penthouseSqft: 300 });
  });
});

describe('independently scheduled structural members', () => {
  const designBase = {
    footings: [],
    columns: [],
    beams: [],
    plinthRunFeet: 0,
  };

  it('keeps unsaved C/B/F types instead of deleting partially entered measurements', () => {
    const design = normalizeDesign({
      ...designBase,
      footings: [{ ...newFootingType(0), label: 'F1', count: 0 }],
      columns: [
        {
          label: 'C1',
          count: 0,
          floors: 0,
          widthIn: 9,
          depthIn: 12,
          bars: '',
          tieDia: 8,
          tieSpacingIn: 6,
        },
      ],
      beams: [
        {
          label: 'B1',
          widthIn: 9,
          depthIn: 15,
          bars: '',
          stirrupDia: 8,
          stirrupSpacingIn: 6,
          runFeet: [0, 0],
          countsByFloor: [0, 0],
        },
      ],
    });
    expect(design?.footings).toHaveLength(1);
    expect(design?.columns).toHaveLength(1);
    expect(design?.beams).toHaveLength(1);
  });

  it('uses actual identical beam counts without changing total run or double-counting concrete', () => {
    const beam = {
      label: 'B1',
      widthIn: 9,
      depthIn: 15,
      bars: '4-16+2-12',
      stirrupDia: 8,
      stirrupSpacingIn: 6,
      runFeet: [60, 0],
    };
    const estimated = generateQuotationBoq({
      details: quote(),
      splitBeamSlab: true,
      design: { ...designBase, beams: [beam] },
    });
    const measured = generateQuotationBoq({
      details: quote(),
      splitBeamSlab: true,
      design: { ...designBase, beams: [{ ...beam, countsByFloor: [3, 0] }] },
    });
    const find = (lines: typeof estimated.lines) =>
      lines.find(
        (line) =>
          line.section === 'Ground Floor' && line.kind === 'quote-beams',
      )!;
    expect(find(measured.lines).inputs.beamRunFeet).toBe(60);
    const concrete = (line: ReturnType<typeof find>) =>
      line.outputs.find((o) => o.material === 'concrete_m20')?.quantity;
    expect(concrete(find(measured.lines))).toBe(
      concrete(find(estimated.lines)),
    );
    const steel = find(measured.lines).outputs.filter((o) => o.unit === 'rod');
    expect(steel.some((o) => o.diameter === 16)).toBe(true);
    expect(steel.some((o) => o.diameter === 12)).toBe(true);
    expect(measured.design?.beams[0]?.countsByFloor).toEqual([3, 0]);
  });

  it('replaces a floor-wide slab once with multiple panels and independent top/bottom rod layers', () => {
    const design = {
      ...designBase,
      slabPanels: [
        {
          label: 'S1',
          floor: 'Ground Floor',
          count: 2,
          lengthFeet: 10,
          widthFeet: 10,
          thicknessIn: 6,
          reinforcement: [
            { layer: 'bottom', direction: 'length', dia: 12, spacingIn: 6 },
            { layer: 'bottom', direction: 'width', dia: 16, spacingIn: 8 },
            { layer: 'top', direction: 'length', dia: 10, spacingIn: 6 },
          ],
        },
        {
          label: 'S2',
          floor: 'Ground Floor',
          count: 1,
          lengthFeet: 20,
          widthFeet: 10,
          thicknessIn: 5,
          reinforcement: [
            { layer: 'bottom', direction: 'width', dia: 8, spacingIn: 6 },
          ],
        },
      ],
    };
    const result = generateQuotationBoq({
      details: quote(),
      design,
      splitBeamSlab: true,
    });
    const line = result.lines.find(
      (row) => row.section === 'Ground Floor' && row.kind === 'quote-slab',
    )!;
    expect(line).toBeDefined();
    expect(line.name).toContain('400 sqft');
    const concrete = line.outputs.find((o) => o.material === 'concrete_m20')!;
    const expectedCft = (2 * 10 * 10 * 6) / 12 + (20 * 10 * 5) / 12;
    expect(concrete.quantity).toBeCloseTo(
      expectedCft *
        0.028316846592 *
        (1 + result.settings.materialWastagePercent / 100),
      1,
    );
    for (const dia of [8, 10, 12, 16])
      expect(
        line.outputs.some((o) => o.unit === 'rod' && o.diameter === dia),
      ).toBe(true);
    expect(
      result.lines.filter(
        (row) => row.section === 'Ground Floor' && row.kind === 'quote-slab',
      ),
    ).toHaveLength(1);
    // First Floor has no panel overrides and keeps its previous calculation.
    expect(
      result.lines.some(
        (row) => row.section === 'First Floor' && row.kind === 'quote-slab',
      ),
    ).toBe(true);
  });

  it('calculates two separate staircase types and never includes the fallback stair on that floor', () => {
    const result = generateQuotationBoq({
      details: quote(),
      splitBeamSlab: true,
      design: {
        ...designBase,
        staircases: [
          {
            label: 'ST1',
            floor: 'Ground Floor',
            count: 2,
            widthFeet: 3,
            riserIn: 6,
            treadIn: 10,
            waistIn: 5,
            landingFeet: 3,
            reinforcement: [
              { role: 'main', dia: 16, spacingIn: 5 },
              { role: 'distribution', dia: 8, spacingIn: 6 },
            ],
          },
          {
            label: 'ST2',
            floor: 'Ground Floor',
            count: 1,
            widthFeet: 4,
            riserIn: 7,
            treadIn: 11,
            waistIn: 6,
            landingFeet: 4,
            reinforcement: [{ role: 'main', dia: 12, spacingIn: 6 }],
          },
        ],
      },
    });
    const stairs = result.lines.filter(
      (line) =>
        line.section === 'Ground Floor' && line.kind === 'quote-staircase',
    );
    expect(stairs).toHaveLength(2);
    expect(stairs.map((line) => line.name).join(' ')).toContain('ST1');
    expect(stairs.map((line) => line.name).join(' ')).toContain('ST2');
    expect(
      stairs
        .flatMap((line) => line.outputs)
        .some((o) => o.unit === 'rod' && o.diameter === 16),
    ).toBe(true);
    expect(
      stairs
        .flatMap((line) => line.outputs)
        .some((o) => o.unit === 'rod' && o.diameter === 12),
    ).toBe(true);
  });

  it('counts each footing mesh direction once and preserves independent concrete volume', () => {
    const footing = {
      ...newFootingType(0),
      label: 'F1',
      count: 2,
      lengthFeet: 5,
      widthFeet: 4,
      thicknessIn: 12,
      mesh: 'double' as const,
    };
    const legacy = generateQuotationBoq({
      details: quote(),
      splitBeamSlab: true,
      design: { ...designBase, footings: [footing] },
    });
    const measured = generateQuotationBoq({
      details: quote(),
      splitBeamSlab: true,
      design: {
        ...designBase,
        footings: [
          {
            ...footing,
            reinforcement: [
              { layer: 'bottom', direction: 'length', dia: 16, spacingIn: 6 },
              { layer: 'bottom', direction: 'width', dia: 12, spacingIn: 6 },
              { layer: 'top', direction: 'length', dia: 20, spacingIn: 8 },
              { layer: 'top', direction: 'width', dia: 10, spacingIn: 8 },
            ],
          },
        ],
      },
    });
    const line = (result: typeof legacy) =>
      result.lines.find((row) => row.kind === 'quote-footings')!;
    const concrete = (result: typeof legacy) =>
      line(result).outputs.find((o) => o.material === 'concrete_m20')?.quantity;
    expect(concrete(measured)).toEqual(concrete(legacy));
    for (const dia of [10, 12, 16, 20]) {
      expect(
        line(measured).outputs.some(
          (o) => o.unit === 'rod' && o.diameter === dia,
        ),
      ).toBe(true);
    }
    const empty = generateQuotationBoq({
      details: quote(),
      splitBeamSlab: true,
      design: { ...designBase, footings: [{ ...footing, reinforcement: [] }] },
    });
    expect(line(empty).outputs.filter((o) => o.unit === 'rod')).toHaveLength(0);
  });
});

describe('footing mesh as drawn (E2E sheet 7: F1 5 x 5 x 12", 12 mm @ 6" c/c)', () => {
  const cover = 25 / 304.8;
  const f1 = {
    ...newFootingType(0),
    count: 12,
    lengthFeet: 5,
    widthFeet: 5,
    thicknessIn: 12,
    bottomBarDia: 12,
    bottomSpacingIn: 6,
  };
  it('never spaces bars wider than drawn and keeps the bent-up legs', () => {
    const pieces = footingMeshPieces(f1, cover);
    expect(pieces).toHaveLength(2);
    for (const piece of pieces) {
      // 5 ft less 2 x 25 mm cover = 4.84 ft at 6" → 10 spaces → 11 bars.
      expect(piece.pieces).toBe(12 * 11);
      // 4.84 ft straight + two legs of (1 ft − 2 x cover).
      expect(piece.lengthFeet).toBeCloseTo(
        5 - 2 * cover + 2 * (1 - 2 * cover),
        3,
      );
    }
  });
  it('counts bars by rounding spaces up', () => {
    expect(barsAcross(4.836, 0.5)).toBe(11);
    expect(barsAcross(5, 0.5)).toBe(11);
    expect(barsAcross(0, 0.5)).toBe(0);
  });
});
