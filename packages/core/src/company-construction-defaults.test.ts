import {describe,it,expect} from 'vitest';
import {companyConstructionPaymentRows,applyCompanyPaymentDefaults,applyCompanyWorkDefaults,defaultCompanyWorkRows,hydrateCompanyWorkDefaults,inferCompanyWorkAreaCode,companyWorkAreaLabel,planningWorkDefaults} from './company-construction-defaults';
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
