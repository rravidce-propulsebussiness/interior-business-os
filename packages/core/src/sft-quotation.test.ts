import { describe, expect, it } from 'vitest';
import {
  calculateSftEstimate,
  editableSftRows,
  sftEstimateInputSchema,
  encodeSftEstimate,
  parseSftEstimate,
} from './sft-quotation';
const schedule = {
  rows: [
    {
      name: 'Parking Area',
      lengthFeet: '20',
      widthFeet: '8',
      ratePerSqft: '900',
    },
    {
      name: 'Ground Commercial',
      lengthFeet: '20',
      widthFeet: '72',
      ratePerSqft: '1380',
    },
    {
      name: 'First Commercial',
      lengthFeet: '20',
      widthFeet: '72',
      ratePerSqft: '1380',
    },
    {
      name: 'Second Commercial',
      lengthFeet: '20',
      widthFeet: '72',
      ratePerSqft: '1380',
    },
    {
      name: 'Penthouse',
      lengthFeet: '20',
      widthFeet: '52',
      ratePerSqft: '1780',
    },
  ],
  materialIds: [],
};
describe('floor-wise per-SFT construction estimates', () => {
  it('reproduces the work-row totals of the example without seeding a customer', () => {
    const result = calculateSftEstimate(schedule);
    expect(result.rows.map((row) => row.areaSqft)).toEqual([
      '160.00',
      '1440.00',
      '1440.00',
      '1440.00',
      '1040.00',
    ]);
    expect(result.totalAreaSqft).toBe('5520.00');
    expect(result.total).toBe('7956800.00');
  });
  it('snapshots every rate and later decodes without external lookups', () => {
    const result = calculateSftEstimate(schedule);
    expect(parseSftEstimate(encodeSftEstimate(result))).toEqual(result);
  });
  it('prevents invalid dimensions and mismatched material counts', () => {
    expect(() =>
      calculateSftEstimate({
        ...schedule,
        rows: [
          {
            name: 'Invalid',
            lengthFeet: '0',
            widthFeet: '8',
            ratePerSqft: '800',
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      calculateSftEstimate({
        ...schedule,
        materialIds: ['11111111-1111-4111-8111-111111111111'],
      }),
    ).toThrow();
  });

  it('prices G+1 and selected extra works once, snapshots the company package, and survives reload', () => {
    const detail = calculateSftEstimate(
      {
        rows: [
          {
            kind: 'floor',
            name: 'Ground Floor',
            lengthFeet: '20',
            widthFeet: '30',
            ratePerSqft: '1950',
          },
          {
            kind: 'floor',
            name: 'First Floor',
            lengthFeet: '20',
            widthFeet: '20',
            ratePerSqft: '1950',
          },
          {
            kind: 'additional',
            name: 'Footings / Foundation',
            lengthFeet: '10',
            widthFeet: '10',
            ratePerSqft: '900',
          },
          {
            kind: 'additional',
            name: 'Elevation Works',
            lengthFeet: '10',
            widthFeet: '15',
            ratePerSqft: '400',
          },
        ],
        packageId: '22222222-2222-4222-8222-222222222222',
        materialIds: [],
        sections: [
          {
            title: 'Steel',
            description: 'TMT steel according to structural engineer design.',
          },
          {
            title: 'Elevation',
            description: 'Included finishing design and external painting.',
          },
        ],
      },
      [],
      {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Royal',
        code: 'ROYAL',
        description: 'Structure and finishing',
        ratePerSqft: '1950',
      },
    );
    expect(detail.totalAreaSqft).toBe('1000.00');
    expect(detail.additionalAreaSqft).toBe('250.00');
    expect(detail.total).toBe('2100000.00');
    expect(detail.package?.name).toBe('Royal');
    expect(detail.sections?.[0]?.title).toBe('Steel');
    expect(parseSftEstimate(encodeSftEstimate(detail))).toEqual(detail);
  });

  it('keeps legacy V1 estimates readable and rejects a missing floor', () => {
    const detail = calculateSftEstimate(schedule);
    const legacy = 'SFT_ESTIMATE_V1:' + JSON.stringify(detail);
    expect(parseSftEstimate(legacy)?.total).toBe(detail.total);
    expect(() =>
      calculateSftEstimate({
        rows: [
          {
            kind: 'additional',
            name: 'Footing',
            lengthFeet: '10',
            widthFeet: '10',
            ratePerSqft: '900',
          },
        ],
        materialIds: [],
      }),
    ).toThrow();
  });
});

describe('work-wise dimensions and mixed pricing units', () => {
  it('prices walls by length×height, shelves by L×W, quantities by piece, and keeps floor area separate', () => {
    const result = calculateSftEstimate({
      rows: [
        { kind:'floor', name:'Ground Floor', unit:'sqft', lengthFeet:'40',
          widthFeet:'25', heightFeet:'10', ratePerSqft:'1850' },
        { kind:'additional', name:'Shelves & Sajjas', unit:'sqft',
          lengthFeet:'12', widthFeet:'2', heightFeet:'', ratePerSqft:'1200' },
        { kind:'additional', name:'Compound Wall', unit:'wall_sqft',
          lengthFeet:'100', widthFeet:'1', heightFeet:'6', ratePerSqft:'750' },
        { kind:'additional', name:'Lift', unit:'piece', quantity:'2',
          lengthFeet:'1', widthFeet:'1', heightFeet:'', ratePerSqft:'250000' },
        { kind:'additional', name:'Handrail', unit:'running_ft',
          lengthFeet:'30', widthFeet:'1', heightFeet:'', ratePerSqft:'600' },
      ],
      materialIds:[],
      sections:[{title:'Steel',brand:'JSW',description:'Client-specific material selection'}],
    });
    expect(result.rows.map(r=>r.areaSqft)).toEqual([
      '1000.00','24.00','600.00','2.00','30.00',
    ]);
    expect(result.totalAreaSqft).toBe('1000.00');
    expect(result.additionalAreaSqft).toBe('624.00');
    expect(result.total).toBe('2846800.00');
    expect(parseSftEstimate(encodeSftEstimate(result))).toEqual(result);
  });

  it('does not multiply a floor rate by its informational height', () => {
    const a=calculateSftEstimate({
      rows:[{name:'Ground Floor',lengthFeet:'20',widthFeet:'25',ratePerSqft:'1500',heightFeet:'12'}],
      materialIds:[],
    });
    expect(a.total).toBe('750000.00');
  });
});

describe('different rates for the construction, parking, and penthouse portions of each floor', () => {
  it('prices ground floor split separately, copies full area upstairs and uses penthouse rate', () => {
    const estimate=calculateSftEstimate({
      rows:[
        {kind:'floor',name:'Ground Floor',unit:'sqft',lengthFeet:'20',widthFeet:'25',ratePerSqft:'1850'},
        {kind:'floor',name:'Ground Floor — Parking',unit:'sqft',lengthFeet:'20',widthFeet:'25',ratePerSqft:'800'},
        {kind:'floor',name:'First Floor',unit:'sqft',lengthFeet:'40',widthFeet:'25',ratePerSqft:'1850'},
        {kind:'floor',name:'Second Floor — Penthouse',unit:'sqft',lengthFeet:'20',widthFeet:'10',ratePerSqft:'1300'},
      ],
      materialIds:[],
    });
    expect(estimate.rows.map(row=>row.amount))
      .toEqual(['925000.00','400000.00','1850000.00','260000.00']);
    expect(estimate.totalAreaSqft).toBe('2200.00');
    expect(estimate.total).toBe('3435000.00');
    expect(parseSftEstimate(encodeSftEstimate(estimate))).toEqual(estimate);
  });
});

describe('reopening a saved construction quote does not block Save', () => {
  it('strips calculated display-only amounts while retaining real entered floor data', () => {
    const original=calculateSftEstimate({
      rows: [
        {kind:'floor', name:'Ground Floor', lengthFeet:'30',widthFeet:'40',
          heightFeet:'', quantity:'',unit:'sqft',ratePerSqft:'1850'},
        {kind:'floor', name:'First Floor', lengthFeet:'20',widthFeet:'40',
          inheritFromPrevious:false,heightFeet:'',quantity:'',unit:'sqft',ratePerSqft:'1850'},
        {kind:'floor', name:'Second Floor', lengthFeet:'20',widthFeet:'40',
          inheritFromPrevious:true,heightFeet:'',quantity:'',unit:'sqft',ratePerSqft:'1850'},
        {kind:'floor', name:'Second Floor — Penthouse', lengthFeet:'20',widthFeet:'20',
          heightFeet:'', quantity:'',unit:'sqft',ratePerSqft:'1850'},
      ],
      materialIds:[],
    });
    const restored=parseSftEstimate(encodeSftEstimate(original));
    expect(restored).not.toBeNull();
    // The former editor copied these output fields into strict input rows.
    expect(sftEstimateInputSchema.safeParse({
      rows:restored!.rows,materialIds:[],
    }).success).toBe(false);
    const editable=editableSftRows(restored!);
    expect(editable).toHaveLength(4);
    expect(editable[0]).toMatchObject({name:'Ground Floor',lengthFeet:'30',widthFeet:'40'});
    expect(editable[0]).not.toHaveProperty('areaSqft');
    expect(editable[0]).not.toHaveProperty('amount');
    expect(editable[2]?.inheritFromPrevious).toBe(true);
    expect(sftEstimateInputSchema.safeParse({rows:editable,materialIds:[]}).success).toBe(true);
    expect(calculateSftEstimate({rows:editable,materialIds:[]}).total).toBe(original.total);
  });
});
