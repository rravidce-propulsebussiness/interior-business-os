import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {mapRequirementField,requirementKey,quickRequirementFields,type QuickRequirementField} from '../requirement-fields';

const read=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');
describe('Premium Requirement Fields reuse single CRM configuration',()=>{
 const page=read('./page.tsx');
 const workspace=read('./requirement-fields-workspace.tsx');
 const lead=read('../leads/quick-add-lead.tsx');
 const action=read('../leads/quick-add-action.ts');
 it('keeps one canonical Lead Requirement Fields screen under Main Settings',()=>{
  const settings=read('../../settings/page.tsx');
  const sidebar=read('../../owner-workspace-navigation.ts');
  const leadsNav=read('../../leads-navigation.ts');
  expect(settings).toContain("tab==='lead-fields'&&leadFieldsContent");
  expect(settings).toContain('<RequirementFieldsWorkspace');
  expect(settings).toContain("href:'/dashboard/settings?tab=lead-fields'");
  expect(settings).toContain("crm.crm.search('crm_requirement_fields'");
  expect(settings).toContain("canManage={crm.allowed('crm.pipeline.manage')}");
  expect(page).toContain("redirect('/dashboard/settings?tab=lead-fields')");
  expect(page).toContain("redirect('/dashboard/crm/leads')");
  expect(page).not.toContain('MasterForm');
  expect(sidebar).not.toContain('Lead Settings');
  expect(sidebar).not.toContain("href:'/dashboard/crm/settings'");
  expect(leadsNav).not.toContain('Lead Settings');
  expect(workspace).not.toContain('crf-nav');
  for(const hidden of ['lead_sources','crm_pipeline_stages','crm_lost_reasons'])
   expect(workspace).not.toContain(hidden);
 });
 it('renders mockup library and actual field editor with one persistence action',()=>{
  for(const text of ['Lead Requirement Fields','Search fields','Construction','Interiors',
    'Add Field','New Requirement Field','Question label','Stable key',
    'Answer type','Select (Dropdown)','Required field','Active field',
    'Display order','Lead form preview','Save Field'])
   expect(workspace).toContain(text);
  expect(workspace).toContain("saveCrm('crm_requirement_fields'");
  expect(workspace).toContain('router.refresh()');
  expect(workspace).not.toContain('deleteCrm');
  expect(workspace).toContain("disabled={Boolean(draft.id)}");
  expect(workspace).toContain('className="crf-layout"');
  expect(workspace).toContain('className="crf-sidepanel"');
  expect(workspace).toContain('className="crf-add crf-add-top"');
  expect(workspace).toContain("window.matchMedia('(min-width: 921px)')");
  const css=read('./requirement-fields.css');
  expect(css).toContain('grid-template-columns:minmax(0,1fr) minmax(340px,390px)');
  expect(css).toContain('.crf-mobile-scrim');
  expect(css).not.toContain('.crf-nav');
  expect(workspace).not.toContain('href="/dashboard/crm/leads"');
 });
 it('uses same fields in original Add Lead form and validates on the server',()=>{
  expect(lead).toContain('quickRequirementFields(requirementFields,service)');
  expect(lead).toContain('extraRequirements:Object.fromEntries');
  expect(action).toContain("s.crm.search(");
  expect(action).toContain("'crm_requirement_fields',{active:true}");
  expect(action).toContain('if(field.required)return');
  expect(action).toContain("field.options.includes(answer)");
  expect(action).toContain('Object.assign(requirements,validExtra)');
 });
 it('never repeats questions the original Add Lead form already contains',()=>{
  const base={id:'id',version:1,industryId:null,sortOrder:0,active:true,required:true,
   options:[],fieldType:'text' as const};
  const fields:QuickRequirementField[]=[
   {...base,key:'plot_area_sq_yards',name:'Plot area',service:'construction'},
   {...base,key:'site_road_width',name:'Road width',service:'construction'},
   {...base,key:'site_road_width',name:'Road width duplicate',service:'construction'},
   {...base,key:'interior_material_choice',name:'Material',service:'interior'},
   {...base,key:'common_note',name:'Common note',service:null},
   {...base,key:'hidden',name:'Inactive',active:false,service:null},
  ];
  expect(quickRequirementFields(fields,'construction').map(item=>item.key))
   .toEqual(['site_road_width','common_note']);
  expect(quickRequirementFields(fields,'interior').map(item=>item.key))
   .toEqual(['interior_material_choice','common_note']);
 });
 it('keeps stable names and dropdown data intact for existing fields',()=>{
  const mapped=mapRequirementField({id:'abc',version:3,key:'number_of_floors',
   name:'Number of Floors',industry_id:null,field_type:'select',
   options:['Ground','G+1','G+2'],required:true,sort_order:4,active:false});
  expect(mapped).toMatchObject({version:3,key:'number_of_floors',fieldType:'select',
   required:true,active:false,options:['Ground','G+1','G+2']});
  expect(requirementKey('Number of Floors')).toBe('number_of_floors');
 });
});
