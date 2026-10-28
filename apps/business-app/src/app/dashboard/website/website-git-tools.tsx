'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { exportWebsitePageHtml } from './website-git-export';
import { pullGithubStaticPages, inspectGithubSourceFiles, retrieveGithubSourceFile } from './github-pull';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import './website-entry.css';

function normalizeRepository(input: string): { github: string; vscode: string } | null {
  try {
    const u = new URL(input.trim());
    if (u.protocol !== 'https:' || u.hostname.toLowerCase() !== 'github.com'
      || u.username || u.password || u.search || u.hash) return null;
    const parts = u.pathname.replace(/\/$/, '').replace(/\.git$/, '').split('/').filter(Boolean);
    if (parts.length !== 2 || parts.some(part => !/^[a-zA-Z0-9_.-]{1,100}$/.test(part))
      || parts.some(part => part === '.' || part === '..')) return null;
    return {
      github: `https://github.com/${parts[0]}/${parts[1]}`,
      vscode: `https://vscode.dev/github/${parts[0]}/${parts[1]}`,
    };
  } catch { return null; }
}

export function WebsiteGitTools({ id, name, pages, version, canPull }: {
  id: string; name: string; pages: {path:string; title:string}[];
  version:number; canPull:boolean;
}) {
  const router=useRouter();
  const [url, setUrl] = useState('');
  const [sourceFiles,setSourceFiles] = useState<string[]>([]);
  const [sourcePath,setSourcePath] = useState('');
  const [sourceText,setSourceText] = useState('');
  const [defaultBranch,setDefaultBranch] = useState('');
  const [sourceMessage,setSourceMessage] = useState('');
  const [sourceBusy,startSource] = useTransition();
  const [pulling, startPull] = useTransition();
  const [imported, setImported] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [pagePath, setPagePath] = useState(pages.find(p => p.path === '/')?.path ?? pages[0]?.path ?? '/');
  const [exporting, startExport] = useTransition();
  const savedKey = `business-os:website-git-repo:${id}`;
  const links = useMemo(() => normalizeRepository(url), [url]);
  useEffect(() => {
    // This is a per-browser shortcut only. No GitHub tokens are stored here.
    try { const previous = localStorage.getItem(savedKey); if (previous) setUrl(previous); }
    catch { /* Private browsing does not always permit local storage. */ }
  }, [savedKey]);
  const save = () => {
    if (!links) { setMessage('Enter a valid GitHub repository URL (https://github.com/owner/repository).'); return; }
    try {
      localStorage.setItem(savedKey, links.github);
      setUrl(links.github);
      setMessage('Repository shortcut saved in this browser. Automatic syncing is not enabled.');
    } catch { setMessage('This browser could not save the shortcut. You can still open the links below.'); }
  };
  const pull = () => {
    if(!links || !canPull || pulling)return;
    if(!window.confirm('Pull supported static HTML/CSS pages from this public GitHub repository into new private drafts? Existing pages and published website will not be replaced.'))return;
    startPull(async()=>{
      const result=await pullGithubStaticPages(id,version,links.github);
      setMessage(result.message);
      if(result.ok){setImported(result.pages);router.refresh();}
    });
  };
  const inspectSources = () => {
    if(!links||sourceBusy)return;
    startSource(async()=>{
      const result=await inspectGithubSourceFiles(id,links.github);
      setSourceMessage(result.message+(result.truncated?' GitHub truncated the large tree; enter another path manually.':''));
      setSourceFiles(result.files);
      setDefaultBranch(result.ok && result.defaultBranch ? result.defaultBranch : '');
      if(result.files.length)setSourcePath(result.files[0]!);
    });
  };
  const retrieveSource = () => {
    if(!links||!sourcePath||sourceBusy)return;
    startSource(async()=>{
      const result=await retrieveGithubSourceFile(id,links.github,sourcePath);
      setSourceMessage(result.message);
      if(result.ok && typeof result.source==='string')setSourceText(result.source);
    });
  };
  const downloadSource = () => {
    if(!sourceText||!sourcePath)return;
    const blob=new Blob([sourceText],{type:'text/plain;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');
    link.href=url;link.download=sourcePath.split('/').at(-1)??'source.txt';
    document.body.appendChild(link);link.click();link.remove();
    requestAnimationFrame(()=>URL.revokeObjectURL(url));
  };
  const exportPage = () => startExport(async () => {
    try {
      const result = await exportWebsitePageHtml(id, pagePath);
      const objectUrl = URL.createObjectURL(new Blob([result.html],
        {type:'text/html;charset=utf-8'}));
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // No background timers are necessary; revoke after the browser has
      // completed the synchronous download gesture.
      requestAnimationFrame(() => URL.revokeObjectURL(objectUrl));
      setMessage('HTML snapshot exported. Check image URLs and deploy configuration before external hosting.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to export page HTML.');
    }
  });
  return <main id="main-content" className="we-entry">
    <header className="we-head"><div className="we-identity">
      <span className="we-symbol" aria-hidden="true">⌘</span>
      <div><span className="we-eyebrow">ADVANCED CUSTOMIZATION</span>
        <h1>GitHub & VS Code</h1>
        <p>{name} · Full-code editing in your own external repository</p>
      </div></div><Link className="we-outline" href={`/dashboard/website/${id}`}>← Your website</Link>
    </header>
    <section className="we-git-grid">
      <div className="we-git-card">
        <h2>Open your GitHub project</h2>
        <p>Paste the repository where you develop your full website, then open it in GitHub or VS Code for Web.</p>
        <label htmlFor="we-git-url">GitHub repository URL</label>
        <input id="we-git-url" type="url" value={url} onChange={e => {setUrl(e.target.value);setMessage('');}}
          placeholder="https://github.com/your-business/website" spellCheck={false}/>
        <div className="we-git-buttons">
          <button type="button" className="we-primary" onClick={save}>Save repository URL</button>
          {links && <a className="we-outline" href={links.github} target="_blank" rel="noopener noreferrer">
            Open GitHub ↗</a>}
          {links && <a className="we-outline" href={links.vscode} target="_blank" rel="noopener noreferrer">
            Open VS Code ↗</a>}
        </div>
        <div className="we-git-export">
          <h3>Pull & inspect GitHub source — all supported languages</h3>
          <p>Browse and download source files from a public repository: HTML, CSS, JavaScript, TypeScript, React JSX/TSX, Vue, Svelte, Astro, PHP, Python, Java, Go, Rust, SQL, Markdown and more. This works with mixed-language repositories, including your Business OS Next.js project. Source browsing is read-only. It does not run or deploy the project.</p>
          <button type="button" className="we-outline" disabled={!links||sourceBusy}
            onClick={inspectSources}>{sourceBusy?'Reading GitHub…' : 'Browse / Pull repository source files'}</button>
          <label htmlFor="we-git-source-file">Source file path</label>
          <input id="we-git-source-file" value={sourcePath} placeholder="apps/web/src/app/page.tsx"
            onChange={event=>{setSourcePath(event.target.value);setSourceText('');}} spellCheck={false}
            list="we-git-source-options"/>
          <datalist id="we-git-source-options">{sourceFiles.map(path=>
            <option key={path} value={path}/>)}</datalist>
          <div className="we-git-buttons">
            <button type="button" className="we-primary" disabled={!links||!sourcePath||sourceBusy}
              onClick={retrieveSource}>{sourceBusy?'Pulling file…':'Pull selected source file'}</button>
            <button type="button" className="we-outline" disabled={!sourceText}
              onClick={downloadSource}>↓ Download source</button>
          </div>
          {defaultBranch && links && <a className="we-outline we-source-zip"
            href={`${links.github}/archive/refs/heads/${defaultBranch.split('/').map(encodeURIComponent).join('/')}.zip`}
            rel="noopener noreferrer" target="_blank">
            ↓ Download complete repository ZIP (all languages)
          </a>}
          {sourceMessage&&<p className="we-notice" role="status">{sourceMessage}</p>}
          {sourceText&&<textarea className="we-git-source-code" readOnly rows={16}
            aria-label="Retrieved source code" value={sourceText}/>}
          <p className="we-git-disclaimer">The full repository ZIP contains supported and unsupported source languages. Files can be opened in VS Code. This does not install, run, publish, or synchronize a React/Next.js/PHP backend into the template editor.</p>
        </div>
        <div className="we-git-pull-panel">
          <h3>Import static HTML or prebuilt framework exports</h3>
          <p>Import supported <strong>static HTML/CSS</strong> from the repository root or common build folders (<code>out/</code>, <code>dist/</code>, <code>build/</code>). For React, Vite, Astro or Next.js, build and commit an HTML export first. Existing website pages remain untouched.</p>
          <button className="we-primary" type="button" onClick={pull}
            disabled={!links || !canPull || pulling}>
            {pulling ? 'Importing static pages…' : '↓ Import static HTML / exported pages'}
          </button>
          {!canPull && <p>Static HTML/CSS import is unavailable for this website's current plan or your editing permissions. Developer Mode and Custom Code must be enabled to import files. You can still use <strong>Browse source files — multiple languages</strong> below.</p>}
          <p className="we-git-disclaimer">Framework source, PHP/Python backends, scripts, external assets and private repositories cannot run in the visual builder. Static HTML exports may be imported after sanitization. Full applications need separate Git deployment and hosting. Imported drafts at /git-home, /git-about, etc. will not replace your current live home page.</p>
          {imported.length>0 && <div className="we-git-imported"><strong>Imported draft pages</strong>
            {imported.map(path=><span key={path}>{path}</span>)}
            <Link className="we-outline" href={`/dashboard/website/${id}/developer`}>Edit imported files</Link>
          </div>}
        </div>
        {message && <p className="we-notice" role="status">{message}</p>}
        <p className="we-git-disclaimer">The repository shortcut is saved in this browser only; it is not a persistent GitHub OAuth connection or automatic synchronization.</p>
        <div className="we-git-export">
          <h3>Export the current template as HTML</h3>
          <p>Download the rendered code of a website page. You can edit the HTML and CSS in VS Code, then commit it to your external Git repository.</p>
          <label htmlFor="we-page-export">Page to export</label>
          <select id="we-page-export" value={pagePath} onChange={event => setPagePath(event.target.value)}>
            {pages.map(page => <option key={page.path} value={page.path}>{page.title} ({page.path})</option>)}
          </select>
          <button type="button" className="we-outline" onClick={exportPage}
            disabled={exporting || !pages.length}>{exporting ? 'Preparing HTML…' : '↓ Export page HTML'}</button>
          <p className="we-git-disclaimer">This exports a static HTML snapshot, not the original framework source or a synced project. Replace Business OS-only asset links and configure forms before externally publishing.</p>
        </div>
      </div>
      <aside className="we-git-card we-git-info">
        <h2>How full-code customization works</h2>
        <p>There are two different website workflows:</p>
        <div><strong>Normal website editing</strong><p>Use Website Studio to edit texts, projects, images, sections and styles. No coding required.</p></div>
        <div><strong>Developer website</strong><p>Import a compatible public static page as a draft file. Edit full React/Next.js code in GitHub or VS Code using separate hosting.</p></div>
        <div><strong>Publishing</strong><p>A full GitHub project requires its own hosting and deployment setup. It is <b>not automatically imported, synced or published</b> by the template builder.</p></div>
        <Link className="we-outline" href={`/dashboard/website/${id}/developer`}>Edit supported HTML/CSS/JS in Business OS</Link>
      </aside>
    </section>
  </main>;
}
