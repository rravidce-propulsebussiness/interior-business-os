'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { websiteServices } from './service';
import { sanitizeHtml, validateCss } from '@business-os/website-builder/compiler';
import { validateDocument, type WebsiteDocument } from '@business-os/website-builder';
import { safeFailure } from '@business-os/shared';
import { parsePublicGithubRepo } from './github-pull-url';

async function githubText(url: string, max: number): Promise<string> {
  // Only two fixed GitHub-owned hosts are used; never fetch user URL directly.
  const origin = new URL(url);
  if (!['api.github.com','raw.githubusercontent.com'].includes(origin.hostname) ||
      origin.protocol !== 'https:') throw new Error('Invalid GitHub file host');
  const result = await fetch(url, {
    cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8500),
    headers:{'User-Agent':'BusinessOS-WebsiteImporter/1.0','Accept':'application/vnd.github+json'},
  });
  if (!result.ok) {
    if (result.status===403 || result.status===429)
      throw new Error('GitHub rate limit reached. Try again later.');
    if (result.status===404) throw new Error('Public GitHub repository or file not found.');
    throw new Error('GitHub could not return this public repository.');
  }
  if (Number(result.headers.get('content-length') || 0)>max)
    throw new Error('GitHub file exceeds the import size limit');
  const text = await result.text();
  if (text.length>max) throw new Error('GitHub file exceeds the import size limit');
  return text;
}

/** Pull supported public static HTML/CSS into NEW draft code pages.
 * It intentionally does not execute repository scripts, import framework code,
 * overwrite existing pages or touch the published website.
 */
export async function pullGithubStaticPages(
  websiteId:string, expectedVersion:number, repositoryUrl:string,
): Promise<{ok:boolean;message:string;pages:string[]}> {
  let writes=0;
  try {
    const parsed = parsePublicGithubRepo(repositoryUrl);
    if (!parsed) throw new Error('Enter https://github.com/owner/repository');
    const s=await websiteServices('website.custom_code.edit');
    if (!s.allowed('website.page.create') || !s.allowed('website.page.edit') ||
        !s.allowed('website.seo.manage'))
      throw new Error('Your role needs page creation permission to import a website');
    const site=await s.website.read(websiteId);
    if (site.version!==expectedVersion)
      throw new Error('This website changed. Refresh before importing GitHub files.');
    const base=`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`;
    const metadata=JSON.parse(await githubText(base,70000)) as {
      private?:boolean; default_branch?:string;
    };
    if (metadata.private || !metadata.default_branch ||
        !/^[a-zA-Z0-9_.\/-]{1,180}$/.test(metadata.default_branch) ||
        metadata.default_branch.includes('..'))
      throw new Error('Only public repositories with a readable default branch are supported.');
    const treeResponse=JSON.parse(await githubText(
      `${base}/git/trees/${encodeURIComponent(metadata.default_branch)}?recursive=1`,900000,
    )) as {truncated?:boolean;tree?:{path:string;type:string;size?:number}[]};
    if (treeResponse.truncated) throw new Error('Repository is too large to inspect safely.');
    const files=(treeResponse.tree ?? []).filter(file=>
      file.type==='blob' && (file.size??0)<=50000 &&
      /^(?:(?:pages\/)?[a-z0-9-]+\.html)$/i.test(file.path));
    if (!files.length) throw new Error('No supported static HTML pages found. React, Next.js and PHP projects cannot be imported by this editor.');
    if (files.length>12)
      throw new Error('More than 12 HTML pages found. Use a smaller static site repository.');
    const styling=treeResponse.tree?.find(file =>
      file.type==='blob' && (file.size??0)<=30000 &&
      /^(?:style|styles|main)\.css$/i.test(file.path));
    const root=`https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${metadata.default_branch.split('/').map(encodeURIComponent).join('/')}`;
    let css='';
    if (styling) {
      try {
        css=validateCss(await githubText(`${root}/${styling.path}`,30000));
      } catch { /* Unsupported remote CSS is not imported. */ }
    }
    const usedPaths=new Set(site.document.pages.map(p=>p.path));
    const additions:WebsiteDocument['pages']=[];
    const code=[...site.document.code];
    const skipped:string[]=[];
    for(const file of files.sort((a,b)=>a.path.localeCompare(b.path))) {
      const basename=file.path.split('/').at(-1)!.slice(0,-5);
      const slug='git-'+(basename==='index'?'home':basename);
      const path='/'+slug;
      if(usedPaths.has(path)) {skipped.push(file.path+' (already imported)');continue;}
      try {
        const source=await githubText(`${root}/${file.path.split('/').map(encodeURIComponent).join('/')}`,50000);
        const body=source.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? source;
        const html=sanitizeHtml(body.trim());
        if(!html.trim()) throw new Error('Empty HTML');
        if(html.length>48000)throw new Error('Too large');
        const id='g'+randomUUID().replaceAll('-','');
        const nodeId='n'+randomUUID().replaceAll('-','');
        const pageId='p'+randomUUID().replaceAll('-','');
        code.push({id,name:`pages/${slug}.html`,html,css,javascript:''});
        additions.push({
          id:pageId,title:basename==='index'?'Imported Home':basename.replaceAll('-',' '),
          path,visibility:'draft',
          seo:{title:(basename+' | '+site.name).slice(0,160),description:'',noindex:true},
          nodes:[{id:nodeId,type:'custom',props:{code:id},
            style:{},tablet:{},mobile:{},children:[]}],
        });
        usedPaths.add(path);
      } catch {
        skipped.push(file.path+' (unsupported HTML or missing assets)');
      }
    }
    if(!additions.length)
      throw new Error('No importable pages. This editor accepts only safe static HTML without scripts, images or unsupported attributes.');
    if(code.length>30 || site.document.pages.length+additions.length>200)
      throw new Error('Website code/page limit reached. No changes were made.');
    const newPages=[...site.document.pages,...additions];
    validateDocument({...site.document,code,pages:newPages});
    const next=await s.website.save(websiteId,expectedVersion,'code',code);
    writes++;
    await s.website.save(websiteId,next,'pages',newPages);
    revalidatePath('/dashboard/website');
    revalidatePath(`/dashboard/website/${websiteId}/developer`);
    revalidatePath(`/dashboard/website/${websiteId}/layout`);
    return {ok:true,pages:additions.map(p=>p.path),
      message:`Pulled ${additions.length} static HTML page(s) into private drafts under /git-*. `+
        (skipped.length?`Skipped ${skipped.length} unsupported/duplicate files. `:'')+
        'Images, scripts, framework code and publishing were not imported. Open Code / Files to edit, then publish separately.'};
  } catch(error) {
    return {ok:false,pages:[],message:
      (writes?'Some source files saved but pages were not attached. Reload before retrying. ':'')+
      safeFailure(error).message};
  }
}

const sourceFilePattern = /\.(?:html|htm|css|scss|sass|less|js|jsx|ts|tsx|mjs|cjs|json|md|mdx|yaml|yml|vue|svelte|astro|php|py|go|rs|java|kt|swift|rb|sql|sh|xml|toml|txt)$/i;
const excludedSource = /(?:^|\/)(?:\.env(?:\.|$)|\.git\/|\.next\/|node_modules\/|vendor\/|dist\/|build\/|\.npmrc$|id_rsa$|private[-_.]?key|secret[-_.]?key)/i;
function safeSourcePath(path:string):boolean {
  return path.length>0 && path.length<=280 &&
    !path.startsWith('/') && !path.includes('..') && !path.includes('\\') &&
    /^[A-Za-z0-9_./@-]+$/.test(path) &&
    sourceFilePattern.test(path) && !excludedSource.test(path);
}

/** Discover source languages without treating them as runnable website code. */
export async function inspectGithubSourceFiles(
  websiteId:string, repositoryUrl:string,
):Promise<{ok:boolean;message:string;files:string[];truncated:boolean}> {
  try {
    const parsed=parsePublicGithubRepo(repositoryUrl);
    if(!parsed) throw new Error('Enter a valid public GitHub repository URL.');
    const s=await websiteServices('website.custom_code.view');
    await s.website.read(websiteId);
    const base=`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`;
    const repo=JSON.parse(await githubText(base,70000)) as {
      private?:boolean;default_branch?:string;
    };
    if(repo.private||!repo.default_branch||repo.default_branch.includes('..')||
       !/^[A-Za-z0-9_./-]{1,160}$/.test(repo.default_branch))
      throw new Error('Only public repositories are supported by this source browser.');
    const tree=JSON.parse(await githubText(
      `${base}/git/trees/${encodeURIComponent(repo.default_branch)}?recursive=1`,
      2500000,
    )) as {truncated?:boolean;tree?:{path:string;type:string;size?:number}[]};
    const files=(tree.tree??[])
      .filter(f=>f.type==='blob' && (f.size??0)<=100000 &&
        safeSourcePath(f.path))
      .map(f=>f.path).slice(0,200);
    return {ok:true,files,truncated:Boolean(tree.truncated),
      message:files.length
        ? `Found ${files.length} source file(s) across supported languages. These are code files, not automatically runnable templates.`
        : 'No supported source files found in this repository tree.'};
  }catch(e){
    return {ok:false,files:[],truncated:false,
      message:e instanceof Error && /GitHub|public|size limit|rate limit|too large/i.test(e.message)
        ? e.message : safeFailure(e).message};
  }
}

/** Pull one explicit source file for read-only viewing/download.
 * Never executes source, stores its content in the tenant website, or publishes it. */
export async function retrieveGithubSourceFile(
  websiteId:string,repositoryUrl:string,filename:string,
):Promise<{ok:boolean;message:string;path?:string;source?:string}> {
  try {
    const parsed=parsePublicGithubRepo(repositoryUrl);
    if(!parsed||!safeSourcePath(filename))
      throw new Error('Enter a valid public repository and source filename.');
    const s=await websiteServices('website.custom_code.view');
    await s.website.read(websiteId);
    const repo=JSON.parse(await githubText(
      `https://api.github.com/repos/${parsed.owner}/${parsed.repo}`,70000,
    )) as {private?:boolean;default_branch?:string};
    if(repo.private||!repo.default_branch||repo.default_branch.includes('..')||
       !/^[A-Za-z0-9_./-]{1,160}$/.test(repo.default_branch))
      throw new Error('Public GitHub repository unavailable');
    const branch=repo.default_branch.split('/').map(encodeURIComponent).join('/');
    const path=filename.split('/').map(encodeURIComponent).join('/');
    const source=await githubText(
      `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${branch}/${path}`,100000);
    if(source.includes('\u0000'))throw new Error('Binary files cannot be displayed.');
    return {ok:true,path:filename,source,message:`Pulled ${filename} for source review. This does not deploy code.`};
  }catch(e){
    return {ok:false,message:e instanceof Error && /GitHub|public|filename|Binary|size limit|rate limit|too large/i.test(e.message)
      ? e.message : safeFailure(e).message};
  }
}
