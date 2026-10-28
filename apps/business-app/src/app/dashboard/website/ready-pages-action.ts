'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { starterTemplate, validateDocument, type WebsiteDocument, type WebsiteNode } from '@business-os/website-builder';
import { websiteServices } from './service';
import { safeFailure } from '@business-os/shared';

/** Add missing Showcase pages to an existing customer website without replacing
 * an existing home, authored pages, media, settings or published version. */
export async function addReadyMadeWebsitePages(
  websiteId:string,expectedVersion:number,
): Promise<{ok:boolean;message:string}> {
  let writes=0;
  try {
    const s=await websiteServices('website.manage');
    const rights=['website.page.create','website.page.edit','website.navigation.manage',
      'website.seo.manage'] as const;
    if(rights.some(right=>!s.allowed(right)))
      throw new Error('Website page and navigation permissions are required.');
    const site=await s.website.read(websiteId);
    if(site.version!==expectedVersion)
      throw new Error('Website changed. Refresh before adding template pages.');
    const fresh=starterTemplate(site.name,'showcase');
    const existing=new Set(site.document.pages.map(page=>page.path));
    const missing=fresh.pages.filter(page=>!existing.has(page.path));
    const currentHome=site.document.pages.find(page=>page.path==='/');
    const fillBlankHome=Boolean(currentHome && !currentHome.nodes.length);
    if(!missing.length && !fillBlankHome)
      return {ok:true,message:'All six website pages already exist. Open Edit website to change their content.'};
    if(site.document.pages.length+missing.length>200)
      throw new Error('Website page limit reached.');
    const cloneNodes=(nodes:WebsiteNode[]):WebsiteNode[]=>nodes.map(item=>({
      ...structuredClone(item),id:'n'+randomUUID().replaceAll('-',''),
      children:cloneNodes(item.children),
    }));
    const showcaseHome=fresh.pages.find(page=>page.path==='/')!;
    const pages=[...site.document.pages.map(page=>
      fillBlankHome && page.path==='/' ? {
        ...page,nodes:cloneNodes(showcaseHome.nodes),
      } : page),...missing.map(page=>({
      ...structuredClone(page),id:'p'+randomUUID().replaceAll('-',''),
      seo:{...page.seo,title:(page.title+' | '+site.name).slice(0,160),noindex:true},
      visibility:'draft' as const,nodes:cloneNodes(page.nodes),
    }))];
    const initialContent=site.document.content;
    const existingKinds=new Set(initialContent.filter(item=>item.published).map(item=>item.kind));
    const additional=fresh.content.filter(item=>!existingKinds.has(item.kind)).map(item=>({
      ...item,id:'c'+randomUUID().replaceAll('-',''),
    }));
    const content=[...initialContent,...additional];
    const missingMenu=fresh.navigation.filter(link=>
      !site.document.navigation.some(existing=>existing.href===link.href));
    const missingFooter=fresh.footerNavigation.filter(link=>
      !site.document.footerNavigation.some(existing=>existing.href===link.href));
    const navigation=[...site.document.navigation,...missingMenu].slice(0,40);
    const footerNavigation=[...site.document.footerNavigation,...missingFooter].slice(0,40);
    const nextDoc:WebsiteDocument={...site.document,pages,content,navigation,footerNavigation};
    validateDocument(nextDoc);
    const sections=(['content','pages','navigation','footerNavigation'] as const)
      .filter(key=>JSON.stringify(site.document[key])!==JSON.stringify(nextDoc[key]));
    // Versioned saves are sequential, never overwrite one user's published site.
    let version=expectedVersion;
    for(const key of sections){
      version=await s.website.save(websiteId,version,key,nextDoc[key]);
      writes++;
    }
    revalidatePath('/dashboard/website');
    revalidatePath(`/dashboard/website/${websiteId}/layout`);
    return {ok:true,message:
      `Added ${missing.length} ready-made pages${fillBlankHome ? ' and completed your empty Home page' : ''} (${missing.map(page=>page.title).join(', ')}). `+
      'Your existing pages and home content were preserved. New pages are private drafts; edit them and publish when ready.'};
  } catch(error) {
    return {ok:false,message:
      (writes?'Some pages were added before an error. Reload your website to inspect the saved draft. ':'')+
      safeFailure(error).message};
  }
}
