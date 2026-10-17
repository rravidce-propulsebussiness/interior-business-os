'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { OwnerIcon } from '../../owner-shell';
import './project-mobile-tabs.css';

type Tab = 'overview' | 'timeline' | 'site' | 'materials' | 'quality' | 'team' | 'files' | 'finance';
const tabs: {key:Tab;label:string;icon:'dashboard'|'calendar'|'projects'|'purchases'|'check'|'team'|'quotations'|'billing'}[] = [
  {key:'overview',label:'Overview',icon:'dashboard'},
  {key:'timeline',label:'Timeline',icon:'calendar'},
  {key:'site',label:'Site',icon:'projects'},
  {key:'materials',label:'Materials',icon:'purchases'},
  {key:'quality',label:'Quality',icon:'check'},
  {key:'team',label:'Team',icon:'team'},
  {key:'files',label:'Files',icon:'quotations'},
  {key:'finance',label:'Finance',icon:'billing'},
];
export function ProjectMobileTabs({
 projectId,active,allowFinance=false,allowTeam=true,allowMaterials=true,allowQuality=true,allowFiles=true,
}:{
 projectId:string;active:Tab;allowFinance?:boolean;allowTeam?:boolean;allowMaterials?:boolean;allowQuality?:boolean;allowFiles?:boolean;
}) {
 const [selected,setSelected]=useState<Tab>(active);
 useEffect(()=>{
   const update=()=>{
     if(window.location.pathname.endsWith('/site')){
       const map:Record<string,Tab>={
        '#construction-timeline':'timeline',
        '#daily-reports':'site',
        '#materials':'materials',
        '#quality':'quality',
        '#team':'team',
        '#media':'files',
       };
       setSelected(map[window.location.hash] ?? 'site');
     } else setSelected('overview');
   };
   update();
   window.addEventListener('hashchange',update);
   return ()=>window.removeEventListener('hashchange',update);
 },[active]);
 const base='/dashboard/projects/'+encodeURIComponent(projectId);
 const href=(tab:Tab)=>{
  switch(tab) {
   case 'overview':return base;
   case 'timeline':return base+'/site#construction-timeline';
   case 'site':return base+'/site#daily-reports';
   case 'materials':return base+'/site#materials';
   case 'quality':return base+'/site#quality';
   case 'team':return base+'/site#team';
   case 'files':return base+'/site#media';
   case 'finance':return '/dashboard/finance/contracts?project_id='+encodeURIComponent(projectId);
  }
 };
 return <nav aria-label="Project workspace" className="pm-tabs">
  {tabs.filter(t=>(t.key!=='finance'||allowFinance)&&(t.key!=='team'||allowTeam)&&(t.key!=='materials'||allowMaterials)&&(t.key!=='quality'||allowQuality)&&(t.key!=='files'||allowFiles)).map(t=>
   <Link href={href(t.key)} key={t.key}
     className={'pm-tab'+(t.key===selected?' pm-tab-selected':'')}
     aria-current={t.key===selected?'page':undefined}
     onClick={()=>setSelected(t.key)}>
     <OwnerIcon name={t.icon} size={15}/>
     <span>{t.label}</span>
   </Link>)}
 </nav>;
}
