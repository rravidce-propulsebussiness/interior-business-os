import {describe,it,expect} from 'vitest';
import {companyConstructionPaymentRows,applyCompanyPaymentDefaults} from './company-construction-defaults';
import {defaultStageRequirements} from './quotation-stage-requirements';
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
