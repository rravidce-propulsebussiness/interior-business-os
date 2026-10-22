import {describe,expect,it} from 'vitest';
import {projectTimelineStages} from './project-visible-stages';

describe('agreement-first project timeline',()=>{
 it('hides only imported quotation snapshots, without deleting or modifying them',()=>{
  const all=[
   {id:'q',template_code:'QUOTED_SCOPE',title:'Approved quotation & quoted specifications'},
   {id:'a',template_code:'PRECONSTRUCTION',title:'Agreement & preconstruction'},
   {id:'d',template_code:'DESIGN',title:'Architectural & structural design'},
   {id:'r',template_code:'RCC',title:'RCC structure — Ground Floor'},
  ];
  const visible=projectTimelineStages(all);
  expect(visible.map(s=>s.id)).toEqual(['a','d','r']);
  expect(visible[0]?.title).toBe('Agreement & preconstruction');
  expect(all.map(s=>s.id)).toEqual(['q','a','d','r']);
 });
 it('excludes all imported quote pages, including multi-page interior scopes',()=>{
  expect(projectTimelineStages([
   {template_code:'QUOTED_SCOPE'},{template_code:'QUOTED_SCOPE_2'},
   {template_code:'PRECONSTRUCTION'},{template_code:'SITE_SURVEY'},
  ])).toEqual([{template_code:'PRECONSTRUCTION'},{template_code:'SITE_SURVEY'}]);
 });
});
