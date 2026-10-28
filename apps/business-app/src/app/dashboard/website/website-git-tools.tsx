'use client';

import { useEffect, useMemo, useState } from 'react';
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

export function WebsiteGitTools({ id, name }: { id: string; name: string }) {
  const [url, setUrl] = useState('');
  const [message, setMessage] = useState('');
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
          <button type="button" className="we-primary" onClick={save}>Save repository shortcut</button>
          {links && <a className="we-outline" href={links.github} target="_blank" rel="noopener noreferrer">
            Open GitHub ↗</a>}
          {links && <a className="we-outline" href={links.vscode} target="_blank" rel="noopener noreferrer">
            Open VS Code ↗</a>}
        </div>
        {message && <p className="we-notice" role="status">{message}</p>}
        <p className="we-git-disclaimer">This shortcut is saved only in your current browser. It does not install a GitHub integration or store access tokens.</p>
      </div>
      <aside className="we-git-card we-git-info">
        <h2>How full-code customization works</h2>
        <p>There are two different website workflows:</p>
        <div><strong>Normal website editing</strong><p>Use Website Studio to edit texts, projects, images, sections and styles. No coding required.</p></div>
        <div><strong>Developer website</strong><p>Use GitHub + desktop VS Code (or VS Code for Web) to build a separate React/Next.js or other framework website.</p></div>
        <div><strong>Publishing</strong><p>A full GitHub project requires its own hosting and deployment setup. It is <b>not automatically imported, synced or published</b> by the template builder.</p></div>
        <Link className="we-outline" href={`/dashboard/website/${id}/developer`}>Edit supported HTML/CSS/JS in Business OS</Link>
      </aside>
    </section>
  </main>;
}
