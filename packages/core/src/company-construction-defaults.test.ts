import {describe,it,expect} from 'vitest';
import {companyConstructionPaymentRows,applyCompanyPaymentDefaults,applyCompanyWorkDefaults,defaultCompanyWorkRows,hydrateCompanyWorkDefaults,inferCompanyWorkAreaCode,companyWorkAreaLabel,planningWorkDefaults,foundationWorkDefaults,foundationSubstageNames} from './company-construction-defaults';
import {defaultStageRequirements} from './quotation-stage-requirements';
import {proposedConstructionPayments} from './construction-payment-schedule';
import {standardMilestoneWorkflow,validateMilestoneFlow,encodeMilestoneFlow,savedMilestoneFlow} from './quotation-milestone-flow';

describe('company construction defaults vs quotation snapshot',()=>{
 it('validates percentages and preserves current quotation floor codes',()=>{
  const saved=companyConstructionPaymentRows.parse([
   {name:'Advance & Design Fee',percent:20},{name:'Foundation Fee',percent:'80'},
  ]);
  const source=[
   {name:'Agreement Advance',percent:'10',stageCodes:['PRECONSTRUCTION','DESIGN']},
   {name:'Foundation',percent:'90',stageCodes:['FOUNDATION','PLINTH']},
  ];
  const quote=applyCompanyPaymentDefaults(source,saved);
  expect(quote.map(x=>x.name)).toEqual(['Advance & Design Fee','Foundation Fee']);
  expect(quote[1]?.stageCodes).toEqual(['FOUNDATION','PLINTH']);
  expect(source[1]?.percent).toBe('90');
 });
 it('never overwrites suggested floor payments if stage count differs',()=>{
  const source=[{name:'Ground RCC',percent:'100',stageCodes:['RCC/GROUND']}];
  expect(applyCompanyPaymentDefaults(source,[
   {name:'Advance',percent:20},{name:'Foundation',percent:80},
  ])).toEqual(source);
 });
 it('rejects total other than 100%',()=>{
  expect(companyConstructionPaymentRows.safeParse([
   {name:'Advance',percent:20},{name:'Foundation',percent:70},
  ]).success).toBe(false);
 });
 it('preloads existing works and checks in sequence without mutating template definitions',()=>{
  const rows=[{stageCodes:['DESIGN']},{stageCodes:['FOUNDATION']}];
  const before=defaultStageRequirements('FOUNDATION');
  const plan=standardMilestoneWorkflow(rows,{});
  expect(plan['0']?.some(x=>x.kind==='work'&&x.code==='DESIGN')).toBe(true);
  expect(plan['1']?.some(x=>x.kind==='work'&&x.code==='FOUNDATION')).toBe(true);
  expect(plan['1']?.some(x=>x.kind==='check')).toBe(true);
  expect(validateMilestoneFlow(plan,{},rows)).toEqual(plan);
  expect(defaultStageRequirements('FOUNDATION')).toEqual(before);
 });
});


describe('editable work inside company payment defaults',()=>{
 it('hydrates earlier company payment rows with construction work without changing fees',()=>{
  const ground=defaultCompanyWorkRows([
   {name:'Advance',percent:'20',stageCodes:['PRECONSTRUCTION','DESIGN']},
   {name:'Foundation',percent:'80',stageCodes:['FOUNDATION']},
  ]);
  const legacy=companyConstructionPaymentRows.parse([
   {name:'Owner advance fee',percent:20},{name:'Foundation fee',percent:80},
  ]);
  const migrated=hydrateCompanyWorkDefaults(legacy,ground);
  expect(migrated[0]?.name).toBe('Owner advance fee');
  expect(migrated[1]?.percent).toBe(80);
  expect(migrated[0]?.steps?.some(s=>s.kind==='work')).toBe(true);
  expect(companyConstructionPaymentRows.parse(migrated)).toEqual(migrated);
 });
 it('clones ordered material/check/QC against real quotation stage codes',()=>{
  const payments=[{stageCodes:['PRECONSTRUCTION']},{stageCodes:['FOUNDATION']}];
  const defaults=companyConstructionPaymentRows.parse([
   {name:'Advance',percent:20,areas:['PRECONSTRUCTION'],steps:[
    {kind:'work',name:'Agreement preparation',area:'PRECONSTRUCTION'},
   ]},
   {name:'Foundation fee',percent:80,areas:['FOUNDATION'],steps:[
    {kind:'work',name:'Excavation',area:'FOUNDATION'},
    {kind:'material',name:'TMT steel',area:'FOUNDATION'},
    {kind:'work',name:'Bar bending',area:'FOUNDATION'},
    {kind:'check',name:'Check rebar spacing',area:'FOUNDATION'},
    {kind:'qc',name:'Check rebar spacing',area:'FOUNDATION'},
    {kind:'work',name:'Footing concrete',area:'FOUNDATION'},
   ]},
  ]);
  const result=applyCompanyWorkDefaults(payments,defaults);
  expect(result.flow['1']?.slice(0,6).map(item=>item.kind))
   .toEqual(['work','material','work','check','qc','work']);
  expect(result.requirements.FOUNDATION?.work).toContain('Bar bending');
  expect(result.requirements.FOUNDATION?.materials).toContain('TMT steel');
  expect(result.requirements.FOUNDATION?.checks).toContain('Check rebar spacing');
  expect(validateMilestoneFlow(result.flow,result.requirements,payments)).toEqual(result.flow);
 });
 it('reuses the same company slab work for a floor with a different code',()=>{
  const payments=[{stageCodes:['RCC/FIRST_FLOOR']}];
  const company=companyConstructionPaymentRows.parse([{
   name:'Ground slab',percent:100,areas:['RCC'],steps:[
    {kind:'work',name:'Column reinforcement',area:'RCC'},
    {kind:'check',name:'Check slab alignment',area:'RCC'},
   ],
  }]);
  const result=applyCompanyWorkDefaults(payments,company);
  expect(result.flow['0']?.[0]).toMatchObject({code:'RCC/FIRST_FLOOR',kind:'work'});
 });
 it('rejects QC before site check and enforces total payment percentage',()=>{
  expect(companyConstructionPaymentRows.safeParse([{
   name:'Stage one',percent:100,areas:['FOUNDATION'],steps:[
    {kind:'qc',name:'Check steel',area:'FOUNDATION'},
    {kind:'check',name:'Check steel',area:'FOUNDATION'},
   ],
  }]).success).toBe(false);
 });
});


describe('editable text labels for technical company work areas',()=>{
 it('preserves project-stage code while allowing arbitrary readable labels',()=>{
  const template=companyConstructionPaymentRows.parse([{
   name:'Foundation fee',percent:100,areas:['FOUNDATION','SITE_PREP'],
   areaLabels:{FOUNDATION:'Footing & pit work',SITE_PREP:'Excavation and setting out'},
   steps:[
    {kind:'work',area:'SITE_PREP',name:'Mark and excavate foundations'},
    {kind:'work',area:'FOUNDATION',name:'Place footing reinforcement'},
   ],
  }]);
  expect(companyWorkAreaLabel(template[0]!,'FOUNDATION')).toBe('Footing & pit work');
  const quote=applyCompanyWorkDefaults([
   {stageCodes:['SITE_PREP','FOUNDATION']},
  ],template);
  expect(quote.flow['0']?.map(item=>item.code).slice(0,2))
   .toEqual(['SITE_PREP','FOUNDATION']);
  expect(quote.requirements.FOUNDATION?.work).toContain('Place footing reinforcement');
 });
 it('rejects custom labels that are not associated with this milestone',()=>{
  expect(companyConstructionPaymentRows.safeParse([{
   name:'Foundation fee',percent:100,areas:['FOUNDATION'],
   areaLabels:{DESIGN:'Hidden unrelated stage'},
  }]).success).toBe(false);
 });
 it('infers canonical stage from natural typed names without changing the label',()=>{
  expect(inferCompanyWorkAreaCode('Site marking and layout')).toBe('SITE_PREP');
  expect(inferCompanyWorkAreaCode('Footing bar bending')).toBe('FOUNDATION');
  expect(inferCompanyWorkAreaCode('Structural design')).toBe('DESIGN');
  expect(inferCompanyWorkAreaCode('Outer plastering')).toBe('EXTERNAL_PLASTER');
  expect(inferCompanyWorkAreaCode('Unspecified other activity')).toBeNull();
 });
});


describe('Stage 1 Planning default payment and ordered site work',()=>{
 it('uses the paid Planning milestone once, followed by exact work/check order',()=>{
  const plans=proposedConstructionPayments(['Ground']);
  const company=defaultCompanyWorkRows(plans);
  const planning=company[0]!;
  expect(planning.name).toBe('Planning');
  expect(planning.percent).toBe(10);
  expect(planning.areas).toEqual(['PRECONSTRUCTION','DESIGN']);
  expect(planning.steps).toEqual(planningWorkDefaults);
  expect(planning.steps?.map(step=>step.name)).toEqual([
   'Price Freeze','Agreement','Floor Plan','Structural Design',
   'MEP Plans','Site Inspection',
  ]);
  expect(planning.steps?.map(step=>step.kind)).toEqual([
   'work','work','work','work','work','check',
  ]);
  expect(companyConstructionPaymentRows.safeParse(company).success).toBe(true);
  expect(company[1]?.areas).toContain('SITE_PREP');
  expect(company[1]?.steps?.some(step=>step.name.toLowerCase().includes('excavat'))).toBe(true);
 });
 it('is cloned into the quotation before later structural inspection controls',()=>{
  const plans=proposedConstructionPayments(['Ground']);
  const company=defaultCompanyWorkRows(plans);
  const quote=applyCompanyWorkDefaults(plans,company);
  const order=(quote.flow['0']??[]).map(step=>{
   const area=quote.requirements[step.code]??defaultStageRequirements(step.code);
   const column=step.kind==='work'?'work':step.kind==='material'?'materials':'checks';
   return area[column][step.index];
  });
  expect(order.slice(0,6)).toEqual([
   'Price Freeze','Agreement','Floor Plan','Structural Design','MEP Plans','Site Inspection',
  ]);
  expect(quote.flow['0']?.[5]?.kind).toBe('check');
  expect(quote.flow['1']?.some(step=>step.code==='SITE_PREP')).toBe(true);
 });
});



describe('Stage 2 Foundation payment: seven grouped, editable substages',()=>{
 const plans=proposedConstructionPayments(['Ground']);
 const defaults=defaultCompanyWorkRows(plans);
 const foundation=defaults[1]!;
 it('retains one 18% milestone with all seven construction substages',()=>{
  expect(foundation.name).toBe('Foundation payment — PCC, footings, plinth & ground bed');
  expect(foundation.percent).toBe(18);
  expect(foundation.areas).toEqual(['SITE_PREP','FOUNDATION','PLINTH']);
  expect(foundation.steps).toEqual(foundationWorkDefaults);
  expect([...new Set(foundation.steps?.map(item=>item.substage))]).toEqual([...foundationSubstageNames]);
  expect(foundation.steps?.length).toBe(71);
  expect(companyConstructionPaymentRows.safeParse(defaults).success).toBe(true);
  expect(defaults[0]?.name).toBe('Planning');
  expect(defaults[2]?.name).toContain('slab payment');
 });
 it('includes excavation clearance, footing steel, column casting, plinth beam, compaction, curing and ground bed',()=>{
  const names=foundation.steps?.map(step=>step.name)??[];
  for(const expected of [
   'Site marking and reference benchmarks',
   'Foundation size, pit depth and grid lines against structural design',
   'PCC bed beneath footings',
   'Bar bending and ties for footings',
   'Footing reinforcement and column starter placement',
   'Footing bar spacing, tie spacing, laps and cover blocks',
   'Footing concreting and vibration',
   'Foundation column concreting and vibration',
   'Plinth beam reinforcement, ties and shuttering',
   'Plinth beam concreting and vibration',
   'Soil compaction in approved layers',
   'Anti-termite treatment per approved method and locations',
   'Ground PCC bed laying, levelling and finishing',
   'Ground PCC curing and protection',
  ])expect(names).toContain(expected);
  expect(foundation.steps?.some(step=>step.kind==='test'&&step.name.includes('cube'))).toBe(true);
 });
 it('does not add a duplicate QC task for each site check',()=>{
  expect(foundation.steps?.filter(step=>step.kind==='qc')).toHaveLength(0);
  expect(foundation.steps?.filter(step=>step.kind==='check').length).toBe(26);
  expect(foundation.steps?.filter(step=>step.kind==='test').length).toBe(4);
  expect(new Set(foundation.steps?.map(step=>[step.area,step.kind,step.name].join('|'))).size)
   .toBe(foundation.steps?.length);
 });
 it('marks sump, masonry and anti-termite work as optional, never forcing them into quotes',()=>{
  const optional=foundation.steps?.filter(step=>step.optional)??[];
  expect(optional.length).toBe(9);
  expect(optional.some(item=>item.name.startsWith('Sump'))).toBe(true);
  expect(optional.some(item=>item.name.startsWith('Granite'))).toBe(true);
  const quote=applyCompanyWorkDefaults(plans.slice(0,2),defaults.slice(0,2));
  const described=(quote.flow['1']??[]).map(item=>{
   const requirements=quote.requirements[item.code]??defaultStageRequirements(item.code);
   const field=item.kind==='work'?'work':item.kind==='material'?'materials':'checks';
   return requirements[field][item.index];
  });
  expect(described).not.toContain('Sump foundation and waterproofing works (if in scope)');
  expect(described).not.toContain('Foundation masonry or basement work per approved design');
  expect(described).not.toContain('Anti-termite treatment per approved method and locations');
  expect(described).toContain('Plinth beam concreting and vibration');
  expect(described).toContain('Footing concreting and vibration');
  expect(quote.flow['1']?.some(item=>item.substage==='Footings')).toBe(true);
  expect(quote.flow['1']?.some(item=>item.substage==='Plinth beam')).toBe(true);
  expect(savedMilestoneFlow(encodeMilestoneFlow(quote.flow))).toEqual(quote.flow);
  expect(validateMilestoneFlow(quote.flow,quote.requirements,plans.slice(0,2)))
   .toEqual(quote.flow);
 });
 it('keeps four-floor company payment defaults inside the supported step budget',()=>{
  const floors=['Ground','First','Second','Third'];
  const multi=defaultCompanyWorkRows(proposedConstructionPayments(floors));
  expect(companyConstructionPaymentRows.safeParse(multi).success).toBe(true);
  expect(multi[1]?.percent).toBe(18);
 });
 it('preserves existing company customizations and percentages instead of silently overwriting them',()=>{
  const saved=companyConstructionPaymentRows.parse([
   {name:'Planning',percent:10,areas:['PRECONSTRUCTION'],steps:[{
    kind:'work',name:'Saved company agreement',area:'PRECONSTRUCTION',
   }]},
   {name:'Customized foundation',percent:90,areas:['FOUNDATION'],steps:[{
    kind:'work',name:'Existing custom footing activity',area:'FOUNDATION',
   }]},
  ]);
  const rebuilt=hydrateCompanyWorkDefaults(saved,defaults);
  expect(rebuilt[1]?.name).toBe('Customized foundation');
  expect(rebuilt[1]?.steps).toEqual(saved[1]?.steps);
  expect(rebuilt[1]?.percent).toBe(90);
 });
});
