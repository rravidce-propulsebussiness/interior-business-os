'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import type { WebsiteDocument } from '@business-os/website-builder';
import { publishWebsite, renderDraftPreview } from './actions';
import { saveWebsiteSource, validateWebsiteSource } from './file-actions';
import {
  workspaceFiles,
  changeSourceFile,
  newSourceComponent,
  removeSourceComponent,
  renameSourceComponent,
} from './file-workspace';
import './file-developer-studio.css';

type Props = {
  id: string;
  name: string;
  initial: WebsiteDocument;
  version: number;
  canEdit: boolean;
  canEditCss: boolean;
  canPublish: boolean;
};
type Modal = 'component' | 'page' | 'rename' | 'delete' | null;

const newId = () => 'n' + crypto.randomUUID().replaceAll('-', '');
const basename = (path: string) => path.split('/').at(-1) ?? path;
const language = (path: string) =>
  path.endsWith('.css') ? 'CSS' : path.endsWith('.js') ? 'JavaScript' : 'HTML';

export function FileDeveloperStudio({
  id,
  name,
  initial,
  version: startVersion,
  canEdit,
  canEditCss,
  canPublish,
}: Props) {
  const [doc, setDoc] = useState(initial);
  const [savedDoc, setSavedDoc] = useState(initial);
  const [version, setVersion] = useState(startVersion);
  const [fileKey, setFileKey] = useState('global:css');
  const [tabs, setTabs] = useState(['global:css']);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    pages: true,
    components: true,
    styles: true,
    scripts: true,
  });
  const [modal, setModal] = useState<Modal>(null);
  const [filename, setFilename] = useState('');
  const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState('');
  const [previewPath, setPreviewPath] = useState('/');
  const [showPreview, setShowPreview] = useState(false);
  const [pending, start] = useTransition();
  const [filter, setFilter] = useState('');
  const textarea = useRef<HTMLTextAreaElement>(null);
  const files = useMemo(() => workspaceFiles(doc), [doc]);
  const chosen = files.find((f) => f.key === fileKey) ?? files[0]!;
  const unsaved =
    JSON.stringify({
      code: doc.code,
      css: doc.css,
      pages: doc.pages,
    }) !==
    JSON.stringify({
      code: savedDoc.code,
      css: savedDoc.css,
      pages: savedDoc.pages,
    });
  const codeSelected =
    chosen.codeId !== null
      ? doc.code.find((c) => c.id === chosen.codeId)
      : undefined;
  const canChange = canEdit && (chosen.codeId !== null || canEditCss);
  const visibleFiles = files.filter((f) =>
    f.path.toLowerCase().includes(filter.toLowerCase()),
  );
  const groups = ['pages', 'components', 'styles', 'scripts'];
  const fileRoute = codeSelected?.name.startsWith('pages/')
    ? codeSelected.name === 'pages/index.html'
      ? '/'
      : '/' + codeSelected.name.slice(6, -5)
    : '/';

  const choose = (key: string) => {
    setFileKey(key);
    setTabs((old) => (old.includes(key) ? old : [...old, key]));
  };
  function update(value: string) {
    try {
      setDoc((old) => changeSourceFile(old, chosen, value));
      setPreview('');
      setNotice('');
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'Invalid file content',
      );
    }
  }
  function add() {
    if (!filename.trim()) {
      setNotice('Enter a component or page name.');
      return;
    }
    if (!canEdit) return;
    try {
      const uid = newId();
      const result = newSourceComponent(
        doc,
        modal === 'page' ? 'pages' : 'components',
        filename,
        uid,
      );
      setDoc(result);
      choose(uid + ':html');
      setModal(null);
      setFilename('');
      setNotice('File created in your draft. Save to keep your changes.');
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'Could not create file',
      );
    }
  }
  function rename() {
    if (!codeSelected || !filename.trim()) return;
    try {
      setDoc((old) => renameSourceComponent(old, codeSelected.id, filename));
      setModal(null);
      setFilename('');
      setNotice('Component renamed. Save to keep your changes.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Rename failed');
    }
  }
  function remove() {
    if (!codeSelected) return;
    try {
      setDoc((old) => removeSourceComponent(old, codeSelected.id));
      setTabs((old) => old.filter((t) => !t.startsWith(codeSelected.id + ':')));
      setFileKey('global:css');
      setModal(null);
      setNotice('Unused component removed from draft. Save to confirm.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Delete failed');
      setModal(null);
    }
  }
  function validate() {
    start(async () => {
      const result = await validateWebsiteSource(id, {
        code: doc.code,
        css: doc.css,
        pages: doc.pages,
      });
      setNotice(result.message);
    });
  }
  function save() {
    start(async () => {
      const result = await saveWebsiteSource(id, version, {
        code: doc.code,
        css: doc.css,
        pages: doc.pages,
      });
      if (result.version !== undefined) setVersion(result.version);
      if (result.saved) setSavedDoc(doc);
      setNotice(result.message);
    });
  }
  function openPreview() {
    start(async () => {
      try {
        const html = await renderDraftPreview(id, doc, fileRoute);
        if (!html) throw new Error('No preview for this page');
        setPreview(html);
        setPreviewPath(fileRoute);
        setShowPreview(true);
        setNotice('Draft preview generated. Forms are disabled.');
      } catch {
        setNotice(
          'Preview unavailable. Validate your HTML, CSS and JavaScript first.',
        );
      }
    });
  }
  function publish() {
    if (unsaved) {
      setNotice('Save your draft before publishing.');
      return;
    }
    start(async () => {
      const result = await publishWebsite(
        id,
        version,
        'Published from Developer Studio',
      );
      setNotice(result.message);
      if (result.id) setVersion((v) => v + 1);
    });
  }
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        document.getElementById('website-source-save')?.click();
      }
    }
    document.addEventListener('keydown', shortcut);
    return () => document.removeEventListener('keydown', shortcut);
  }, []);

  return (
    <main id="main-content" className="web-files">
      <header className="web-files-heading">
        <div className="web-files-identity">
          <span className="web-files-identity-icon" aria-hidden="true">
            {'{ }'}
          </span>
          <div>
            <span className="web-files-kicker">WEBSITE STUDIO / DEVELOPER</span>
            <h1>Code workspace</h1>
            <p>{name} · Edit site files and reusable custom components</p>
          </div>
        </div>
        <div className="web-files-actions">
          <span
            className={unsaved ? 'web-files-state dirty' : 'web-files-state'}
          >
            {unsaved ? '● Unsaved changes' : '✓ Draft saved'}
          </span>
          <button
            type="button"
            onClick={validate}
            disabled={pending}
            className="web-files-outline"
          >
            Validate
          </button>
          <button
            id="website-source-save"
            type="button"
            onClick={save}
            disabled={pending || !canEdit || !unsaved}
            className="web-files-primary"
          >
            {pending ? 'Working…' : 'Save files'}
          </button>
        </div>
      </header>
      <div className="web-files-nav">
        <Link href={`/dashboard/website/${id}`} className="web-files-mode">
          ◈ Template Builder
        </Link>
        <span className="web-files-mode active">⌘ Code Editor</span>
        <span className="web-files-divider" />
        <Link
          href={`/dashboard/website/${id}/versions`}
          className="web-files-text-link"
        >
          Versions
        </Link>
        <Link
          href={`/dashboard/website/${id}/media`}
          className="web-files-text-link"
        >
          Assets
        </Link>
        <button
          type="button"
          onClick={openPreview}
          disabled={pending}
          className="web-files-text-link"
        >
          Preview draft ↗
        </button>
        {canPublish && (
          <button
            type="button"
            onClick={publish}
            disabled={pending || unsaved}
            className="web-files-publish"
          >
            Publish website
          </button>
        )}
      </div>
      <div className="web-files-subhead">
        <div>
          <strong>File explorer</strong>
          <span>Changes are isolated to this company's website</span>
        </div>
        <div className="web-files-subactions">
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => {
              setFilename('');
              setModal('page');
            }}
          >
            + Page file
          </button>
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => {
              setFilename('');
              setModal('component');
            }}
          >
            + Component
          </button>
        </div>
      </div>
      {notice && (
        <p className="web-files-notice" role="status">
          {notice}
        </p>
      )}
      <div className="web-files-workspace">
        <aside
          className="web-files-tree"
          aria-label="Website source file explorer"
        >
          <div className="web-files-treehead">
            <strong>EXPLORER</strong>
            <span>{files.length} files</span>
          </div>
          <input
            aria-label="Find file"
            type="search"
            className="web-files-search"
            placeholder="Search files…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <div className="web-files-tree-body">
            {groups.map((group) => {
              const contents = visibleFiles.filter((f) =>
                f.path.startsWith(group + '/'),
              );
              return (
                <div key={group}>
                  <button
                    type="button"
                    className="web-files-folder"
                    onClick={() =>
                      setExpanded((o) => ({ ...o, [group]: !o[group] }))
                    }
                  >
                    <span aria-hidden="true">
                      {expanded[group] ? '⌄' : '›'} 📁
                    </span>
                    <strong>{group}/</strong>
                    <small>{contents.length}</small>
                  </button>
                  {expanded[group] &&
                    contents.map((f) => (
                      <button
                        type="button"
                        key={f.key}
                        onClick={() => choose(f.key)}
                        title={f.path}
                        className={
                          fileKey === f.key
                            ? 'web-files-entry selected'
                            : 'web-files-entry'
                        }
                      >
                        <span aria-hidden="true">
                          {language(f.path) === 'CSS'
                            ? '◈'
                            : language(f.path) === 'JavaScript'
                              ? 'JS'
                              : '◇'}
                        </span>
                        <span>{basename(f.path)}</span>
                      </button>
                    ))}
                </div>
              );
            })}
            {!visibleFiles.length && (
              <div className="web-files-empty">No matching files</div>
            )}
          </div>
          <div className="web-files-treefooter">
            <strong>Safe authoring</strong>
            <p>
              HTML, CSS and vanilla JavaScript only. No server-side execution or
              package imports.
            </p>
          </div>
        </aside>
        <section className="web-files-editor" aria-label="Source editor">
          <div className="web-files-tabs">
            {tabs
              .filter((k) => files.some((f) => f.key === k))
              .map((k) => {
                const f = files.find((f) => f.key === k)!;
                return (
                  <div
                    key={k}
                    className={
                      k === fileKey ? 'web-files-tab selected' : 'web-files-tab'
                    }
                  >
                    <button type="button" onClick={() => choose(k)}>
                      {basename(f.path)}
                    </button>
                    {tabs.length > 1 && (
                      <button
                        type="button"
                        className="web-files-close-tab"
                        aria-label={`Close ${f.path}`}
                        onClick={() => {
                          setTabs((t) => t.filter((x) => x !== k));
                          if (k === fileKey) setFileKey('global:css');
                        }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                );
              })}
          </div>
          <div className="web-files-pathbar">
            <span>{chosen.path}</span>
            <span>{language(chosen.path)}</span>
          </div>
          <div className="web-files-editor-body">
            <textarea
              ref={textarea}
              spellCheck={false}
              aria-label={`Edit ${chosen.path}`}
              value={chosen.content}
              onChange={(e) => update(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Tab' && !e.shiftKey) {
                  e.preventDefault();
                  const field = e.currentTarget;
                  const from = field.selectionStart,
                    to = field.selectionEnd;
                  update(
                    chosen.content.slice(0, from) +
                      '  ' +
                      chosen.content.slice(to),
                  );
                  requestAnimationFrame(() =>
                    field.setSelectionRange(from + 2, from + 2),
                  );
                }
              }}
              disabled={pending || !canChange}
              placeholder="Enter your source code…"
              className="web-files-codearea"
            />
          </div>
          <div className="web-files-status">
            <span>
              {chosen.content.split('\n').length} lines ·{' '}
              {chosen.content.length.toLocaleString('en-IN')} characters
            </span>
            <span>UTF-8 · {language(chosen.path)} · Ctrl+S to save</span>
          </div>
        </section>
        <aside className="web-files-inspector">
          <h2>File details</h2>
          <p className="web-files-quiet">{chosen.path}</p>
          <div className="web-files-inspector-block">
            <span>Type</span>
            <strong>{language(chosen.path)}</strong>
          </div>
          <div className="web-files-inspector-block">
            <span>Ownership</span>
            <strong>Current company</strong>
          </div>
          {codeSelected && (
            <>
              <div className="web-files-inspector-block">
                <span>Component reference</span>
                <code>{codeSelected.id}</code>
              </div>
              <button
                className="web-files-secondary"
                type="button"
                onClick={() => {
                  void navigator.clipboard
                    ?.writeText(codeSelected.id)
                    .then(() => setNotice('Component reference copied.'))
                    .catch(() =>
                      setNotice('Copy not available in this browser.'),
                    );
                }}
              >
                Copy reference
              </button>
              {!codeSelected.name.startsWith('pages/') && (
                <>
                  <button
                    className="web-files-secondary"
                    type="button"
                    disabled={!canEdit}
                    onClick={() => {
                      setFilename(
                        codeSelected.name
                          .split('/')
                          .at(-1)
                          ?.replace('.html', '') ?? '',
                      );
                      setModal('rename');
                    }}
                  >
                    Rename component
                  </button>
                  <button
                    className="web-files-danger"
                    type="button"
                    disabled={!canEdit}
                    onClick={() => setModal('delete')}
                  >
                    Delete unused component
                  </button>
                </>
              )}
            </>
          )}
          <div className="web-files-advice">
            <strong>How publishing works</strong>
            <p>
              Page files are connected to website routes. Each custom component
              runs in its own sandbox. Existing visual template pages remain
              unchanged.
            </p>
            <p>
              Changes are saved as drafts first; publication uses the existing
              website version system.
            </p>
          </div>
        </aside>
      </div>
      <section className="web-files-guide">
        <div>
          <strong>Visual components</strong>
          <p>
            Existing template header, hero, gallery, and footer remain editable
            in the visual builder.
          </p>
        </div>
        <div>
          <strong>Real website drafts</strong>
          <p>
            Code files persist in the existing website document and version
            history, with permission checks.
          </p>
        </div>
        <div>
          <strong>Security by design</strong>
          <p>
            Custom HTML/JS run inside restricted iframes. Backend integrations
            require approved APIs.
          </p>
        </div>
      </section>
      {showPreview && (
        <div
          className="web-files-modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowPreview(false);
          }}
        >
          <div
            className="web-files-preview-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Draft website preview"
          >
            <header>
              <div>
                <strong>Draft preview</strong>
                <span>{previewPath} · Forms disabled</span>
              </div>
              <button type="button" onClick={() => setShowPreview(false)}>
                Close ×
              </button>
            </header>
            <iframe
              title="Sandboxed draft website"
              srcDoc={preview}
              sandbox="allow-scripts"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
      )}
      {modal && (
        <div
          className="web-files-modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <div
            className="web-files-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Manage website file"
          >
            <h2>
              {modal === 'component'
                ? 'Create reusable component'
                : modal === 'page'
                  ? 'Create code page'
                  : modal === 'rename'
                    ? 'Rename component'
                    : 'Delete component?'}
            </h2>
            {modal !== 'delete' ? (
              <>
                <p>
                  {modal === 'page'
                    ? 'Add a new HTML page and its companion CSS/JavaScript files. Existing template pages will not be overwritten.'
                    : 'Component HTML, CSS and JavaScript are stored together as one reusable group.'}
                </p>
                <label>
                  File name{' '}
                  <input
                    autoFocus
                    value={filename}
                    onChange={(e) => setFilename(e.target.value)}
                    placeholder={modal === 'page' ? 'services' : 'hero-banner'}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        modal === 'rename' ? rename() : add();
                      }
                    }}
                  />
                </label>
              </>
            ) : (
              <p>
                The selected component will be deleted only if it is not used by
                a website page. This change requires saving.
              </p>
            )}
            <footer>
              <button type="button" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button
                type="button"
                className={modal === 'delete' ? 'destructive' : 'primary'}
                onClick={() =>
                  modal === 'delete'
                    ? remove()
                    : modal === 'rename'
                      ? rename()
                      : add()
                }
              >
                {modal === 'delete'
                  ? 'Delete component'
                  : modal === 'rename'
                    ? 'Rename'
                    : 'Create files'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </main>
  );
}
