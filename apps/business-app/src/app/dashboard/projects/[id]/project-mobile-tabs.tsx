'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { OwnerIcon } from '../../owner-shell';
import './project-mobile-tabs.css';

type Focus = 'overview'|'timeline'|'site'|'materials'|'quality'|'team'|
 'files'|'setup'|'security'|'handover'|'more';
type Tab = 'overview'|'timeline'|'site'|'materials'|'more';

const hashFocus:Record<string,Focus>={
 '#construction-timeline':'timeline',
 '#construction-planning':'timeline',
 '#overview':'site',
 '#daily-reports':'site',
 '#manager-updates':'site',
 '#materials':'materials',
 '#quality':'quality',
 '#team':'team',
 '#media':'files',
 '#design':'setup',
 '#initialize':'setup',
 '#launch':'setup',
 '#agreement-readiness':'setup',
 '#security':'security',
 '#handover':'handover',
 '#more':'more',
};
const mainTab=(focus:Focus):Tab=>
 ['quality','team','files','setup','security','handover','more'].includes(focus)
 ? 'more' : focus as Tab;

export function ProjectMobileTabs({
 projectId,active,allowFinance=false,allowTeam=true,
 allowMaterials=true,allowQuality=true,allowFiles=true,
 allowUpdates=true,allowSecurity=false,allowSetup=true,
 allowHandover=false,defaultSiteFocus='timeline',
}:{
 projectId:string;active:Tab;allowFinance?:boolean;allowTeam?:boolean;
 allowMaterials?:boolean;allowQuality?:boolean;allowFiles?:boolean;
 allowUpdates?:boolean;allowSecurity?:boolean;allowSetup?:boolean;
 allowHandover?:boolean;defaultSiteFocus?:Focus;
}) {
 const [focus,setFocus]=useState<Focus>(active==='overview'?'overview':defaultSiteFocus);
 const base='/dashboard/projects/'+encodeURIComponent(projectId);
 const site=base+'/site';
 useEffect(()=>{
   const sync=()=>{
     const inSite=window.location.pathname.endsWith('/site');
     const next:Focus=inSite
       ? hashFocus[window.location.hash] ?? defaultSiteFocus
       : 'overview';
     setFocus(next);
     const page=document.querySelector<HTMLElement>('.site-command-page');
     if(page) page.dataset.projectFocus=next;
   };
   sync();
   window.addEventListener('hashchange',sync);
   return ()=>window.removeEventListener('hashchange',sync);
 },[defaultSiteFocus]);

 const selected=mainTab(focus);
 const items:Array<{key:Tab;label:string;icon:'dashboard'|'calendar'|'projects'|'purchases'|'settings';href:string}>=[
   {key:'overview',label:'Overview',icon:'dashboard',href:base},
   {key:'timeline',label:'Timeline',icon:'calendar',href:site+'#construction-timeline'},
   ...(allowUpdates?[{key:'site' as const,label:'Updates',icon:'projects' as const,href:site+'#daily-reports'}]:[]),
   ...(allowMaterials?[{key:'materials' as const,label:'Materials',icon:'purchases' as const,href:site+'#materials'}]:[]),
   {key:'more',label:'More',icon:'settings',href:site+'#more'},
 ];
 const advanced=[
   ...(allowSetup?[{label:'Agreement & design',href:site+'#design'}]:[]),
   ...(allowQuality?[{label:'Quality checks',href:site+'#quality'}]:[]),
   ...(allowTeam?[{label:'Project team',href:site+'#team'}]:[]),
   ...(allowFiles?[{label:'Documents & photos',href:site+'#media'}]:[]),
   ...(allowSecurity?[{label:'Curing & security',href:site+'#security'}]:[]),
   ...(allowHandover?[{label:'Handover',href:site+'#handover'}]:[]),
   ...(allowFinance?[{label:'Project finances',href:'/dashboard/finance/contracts?project_id='+encodeURIComponent(projectId)}]:[]),
 ];
 return <div className="pm-workspace-nav">
   <nav aria-label="Project workspace" className="pm-tabs">
     {items.map(item=><Link key={item.key} href={item.href}
       className={'pm-tab'+(item.key===selected?' pm-tab-selected':'')}
       aria-current={item.key===selected?'page':undefined}
       onClick={()=>setFocus(item.key)}>
       <OwnerIcon name={item.icon} size={16}/><span>{item.label}</span>
     </Link>)}
   </nav>
   {selected==='more' && <nav className="pm-more-tools" aria-label="Additional project tools">
     <p>More project tools</p>
     <div>{advanced.map(item=><Link key={item.href} href={item.href}
        onClick={()=>{const hash=item.href.includes('#')?item.href.slice(item.href.indexOf('#')):'';setFocus(hashFocus[hash]??'more');}}>
       {item.label} <OwnerIcon name="arrow" size={14}/>
     </Link>)}</div>
   </nav>}
 </div>;
}
