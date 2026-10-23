import {describe,it,expect} from 'vitest';
import {companyConstructionPaymentRows,applyCompanyPaymentDefaults,applyCompanyWorkDefaults,defaultCompanyWorkRows,hydrateCompanyWorkDefaults,inferCompanyWorkAreaCode,companyWorkAreaLabel,planningWorkDefaults,foundationWorkDefaults} from './company-construction-defaults';
import {defaultStageRequirements} from './quotation-stage-requirements';
import {proposedConstructionPayments} from './construction-payment-schedule';
import {standardMilestoneWorkflow,validateMilestoneFlow} from './quotation-milestone-flow';

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


describe('Stage 2 Foundation template without duplicate materials or QC',()=>{
 const plans=proposedConstructionPayments(['Ground']);
 const defaults=defaultCompanyWorkRows(plans);
 const foundation=defaults[1]!;
 it('preserves 18% foundation payment, stage ownership and exact work scope',()=>{
  expect(foundation.name).toBe('Foundation payment — PCC, footings, plinth & ground bed');
  expect(foundation.percent).toBe(18);
  expect(foundation.areas).toEqual(['SITE_PREP','FOUNDATION','PLINTH']);
  expect(foundation.steps).toEqual(foundationWorkDefaults);
  expect(foundation.steps?.filter(step=>step.kind==='work').map(step=>step.name))
   .toEqual([
    'Site marking','Excavation','Foundation pit dressing','PCC',
    'Bar bending','Footing marking','Reinforcement installation','Footings',
    'Plinth level columns','Soil backfilling','Soil compaction',
    'Basement preparation for plinth beam','Soil leveling and compaction',
    'Anti-termite treatment','PCC bed',
   ]);
  expect(companyConstructionPaymentRows.safeParse(defaults).success).toBe(true);
  expect(defaults[0]?.name).toBe('Planning');
  expect(defaults[2]?.name).toContain('slab payment');
 });
 it('includes five distinct materials without repeating the generic cement entry',()=>{
  expect(foundation.steps?.filter(step=>step.kind==='material').map(step=>step.name)).toEqual([
   'Sand (PCC, footings and columns)',
   'Cement (PCC, footings and columns)',
   '40 mm aggregate (PCC)',
   'Reinforcement steel (footings, columns, plinth beam and sump)',
   '20 mm aggregate (footings and columns)',
  ]);
  expect(foundation.steps?.filter(step=>step.kind==='material'&&/cement/i.test(step.name)).length).toBe(1);
 });
 it('pairs exactly three site checks with later company QC checkpoints',()=>{
  const checks=foundation.steps?.filter(step=>step.kind==='check')??[];
  const qcs=foundation.steps?.filter(step=>step.kind==='qc')??[];
  expect(checks.map(step=>step.name)).toEqual([
   'Mix ratio check','Footing marking checks','Bar bending checks',
  ]);
  expect(qcs.map(step=>step.name)).toEqual(checks.map(step=>step.name));
  for(const check of checks){
   const checkAt=foundation.steps!.indexOf(check);
   const qcAt=foundation.steps!.findIndex(step=>step.kind==='qc'&&
     step.name===check.name&&step.area===check.area);
   expect(qcAt).toBeGreaterThan(checkAt);
  }
  expect(checks.every(step=>step.area==='FOUNDATION')).toBe(true);
 });
 it('does not mutate existing company saved templates, or quote paid status',()=>{
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
 it('clones all three foundation work areas as ordered work into a simple quotation',()=>{
  const quoteRows=plans.slice(0,2);
  const mapped=applyCompanyWorkDefaults(quoteRows,defaults.slice(0,2));
  const flow=mapped.flow['1']??[];
  const described=flow.map(step=>{
   const req=mapped.requirements[step.code]??defaultStageRequirements(step.code);
   return {name:req[step.kind==='work'?'work':step.kind==='material'?'materials':'checks'][step.index],
     kind:step.kind,code:step.code};
  });
  expect(described.filter(item=>item.kind==='work').map(item=>item.name))
   .toEqual(foundationWorkDefaults.filter(item=>item.kind==='work').map(item=>item.name));
  expect(described.filter(item=>item.kind==='qc').map(item=>item.name))
   .toEqual(['Mix ratio check','Footing marking checks','Bar bending checks']);
  expect(described.some(item=>item.code==='PLINTH')).toBe(true);
 });
});
