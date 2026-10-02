'use client';
import { useState, useTransition } from 'react';
import { WebsiteSourcePicker } from './source-picker';
import {
  type WebsiteDocument,
  defaultTheme,
} from '@business-os/website-builder';
import {
  saveWebsiteSection,
  publishWebsite,
  changeWebsiteStatus,
} from './actions';
const cls = 'mt-1 w-full rounded border bg-background px-3 py-2 text-sm';
const uid = () => `n${crypto.randomUUID().replaceAll('-', '')}`;
export function WebsiteSettings({
  id,
  initial,
  version: initialVersion,
  tab,
  canEdit,
}: {
  id: string;
  initial: WebsiteDocument;
  version: number;
  tab: string;
  canEdit: boolean;
}) {
  const [doc, setDoc] = useState(initial),
    [version, setVersion] = useState(initialVersion),
    [message, setMessage] = useState(''),
    [pending, start] = useTransition(),
    [selected, setSelected] = useState(0);
  const section =
    (
      { design: 'theme', seo: 'settings', developer: 'code' } as Record<
        string,
        string
      >
    )[tab] ?? tab;
  const save = (key: string, value: unknown) =>
    start(async () => {
      const r = await saveWebsiteSection(id, version, key, value);
      setMessage(r.message);
      if (r.version) setVersion(r.version);
    });
  const content = (
    <>
      {tab === 'content' && canEdit && (
        <WebsiteSourcePicker
          id={id}
          onSelect={(item) =>
            setDoc({ ...doc, content: [...doc.content, item] })
          }
        />
      )}
      {tab === 'design' && (
        <div className="grid gap-5 sm:grid-cols-3">
          {Object.keys(defaultTheme).map((key) => (
            <label key={key} className="text-sm capitalize">
              {key}
              {typeof doc.theme[key as keyof typeof doc.theme] === 'number' ? (
                <input
                  className={cls}
                  type="number"
                  value={Number(doc.theme[key as keyof typeof doc.theme])}
                  onChange={(e) =>
                    setDoc({
                      ...doc,
                      theme: { ...doc.theme, [key]: Number(e.target.value) },
                    })
                  }
                />
              ) : ['headingFont', 'bodyFont', 'shadow', 'buttonStyle'].includes(
                  key,
                ) ? (
                <select
                  className={cls}
                  value={String(doc.theme[key as keyof typeof doc.theme])}
                  onChange={(e) =>
                    setDoc({
                      ...doc,
                      theme: { ...doc.theme, [key]: e.target.value },
                    })
                  }
                >
                  {(key.includes('Font')
                    ? ['serif', 'sans-serif', 'monospace']
                    : key === 'shadow'
                      ? ['none', 'soft', 'strong']
                      : ['solid', 'outline', 'rounded']
                  ).map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              ) : (
                <input
                  className="mt-2 block h-10 w-full rounded border"
                  type="color"
                  value={String(doc.theme[key as keyof typeof doc.theme])}
                  onChange={(e) =>
                    setDoc({
                      ...doc,
                      theme: { ...doc.theme, [key]: e.target.value },
                    })
                  }
                />
              )}
            </label>
          ))}
        </div>
      )}
      {tab === 'seo' && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                'name',
                'description',
                'locale',
                'timezone',
                'phone',
                'email',
                'address',
                'logo',
                'favicon',
              ] as const
            ).map((key) => (
              <label key={key} className="text-sm capitalize">
                {key}
                <input
                  className={cls}
                  value={doc.settings[key] ?? ''}
                  onChange={(e) =>
                    setDoc({
                      ...doc,
                      settings: {
                        ...doc.settings,
                        [key]:
                          ['logo', 'favicon'].includes(key) && !e.target.value
                            ? undefined
                            : e.target.value,
                      },
                    })
                  }
                />
              </label>
            ))}
            <label>
              <input
                type="checkbox"
                checked={doc.settings.noindex}
                onChange={(e) =>
                  setDoc({
                    ...doc,
                    settings: { ...doc.settings, noindex: e.target.checked },
                  })
                }
              />{' '}
              Hide from search engines
            </label>
          </div>
          <h2 className="mt-8 font-semibold">Page search appearance</h2>
          {doc.pages.map((page, i) => (
            <div
              key={page.id}
              className="mt-3 grid gap-3 rounded border p-4 sm:grid-cols-2"
            >
              <h3 className="col-span-full">
                {page.title} · {page.path}
              </h3>
              {(
                [
                  'title',
                  'description',
                  'canonical',
                  'ogTitle',
                  'ogDescription',
                  'image',
                ] as const
              ).map((key) => (
                <label key={key} className="text-xs">
                  {key}
                  <input
                    className={cls}
                    value={page.seo[key] ?? ''}
                    onChange={(e) => {
                      const pages = structuredClone(doc.pages);
                      const seo = pages[i]!.seo;
                      if (e.target.value) seo[key] = e.target.value;
                      else if (key === 'title' || key === 'description')
                        seo[key] = '';
                      else delete seo[key];
                      setDoc({ ...doc, pages });
                    }}
                  />
                </label>
              ))}
              <label className="text-sm">
                <input
                  type="checkbox"
                  checked={page.seo.noindex}
                  onChange={(e) => {
                    const pages = structuredClone(doc.pages);
                    pages[i]!.seo.noindex = e.target.checked;
                    setDoc({ ...doc, pages });
                  }}
                />{' '}
                Noindex this page
              </label>
            </div>
          ))}
          <button
            type="button"
            className="mt-4 rounded border px-4 py-2"
            disabled={pending || !canEdit}
            onClick={() => save('pages', doc.pages)}
          >
            Save page SEO
          </button>
        </>
      )}
      {tab === 'navigation' &&
        (['navigation', 'footerNavigation'] as const).map((key) => (
          <section key={key}>
            <h2 className="mb-3 font-semibold">
              {key === 'navigation' ? 'Header navigation' : 'Footer navigation'}
            </h2>
            {doc[key].map((link, i) => (
              <div key={i} className="mb-3 rounded border p-3">
                <div className="flex flex-wrap gap-3">
                  <label className="flex-1 text-xs">
                    Label
                    <input
                      className={cls}
                      value={link.label}
                      onChange={(e) => {
                        const list = structuredClone(doc[key]);
                        list[i]!.label = e.target.value;
                        setDoc({ ...doc, [key]: list });
                      }}
                    />
                  </label>
                  <label className="flex-1 text-xs">
                    Link
                    <input
                      className={cls}
                      value={link.href}
                      onChange={(e) => {
                        const list = structuredClone(doc[key]);
                        list[i]!.href = e.target.value;
                        setDoc({ ...doc, [key]: list });
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setDoc({
                        ...doc,
                        [key]: doc[key].filter((_, n) => n !== i),
                      })
                    }
                  >
                    Remove
                  </button>
                </div>
                {link.children.map((child, n) => (
                  <div key={n} className="ml-5 mt-2 flex gap-2">
                    <input
                      aria-label="Dropdown label"
                      className={cls}
                      value={child.label}
                      onChange={(e) => {
                        const list = structuredClone(doc[key]);
                        list[i]!.children[n]!.label = e.target.value;
                        setDoc({ ...doc, [key]: list });
                      }}
                    />
                    <input
                      aria-label="Dropdown link"
                      className={cls}
                      value={child.href}
                      onChange={(e) => {
                        const list = structuredClone(doc[key]);
                        list[i]!.children[n]!.href = e.target.value;
                        setDoc({ ...doc, [key]: list });
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const list = structuredClone(doc[key]);
                        list[i]!.children.splice(n, 1);
                        setDoc({ ...doc, [key]: list });
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="mt-2 text-xs underline"
                  onClick={() => {
                    const list = structuredClone(doc[key]);
                    list[i]!.children.push({ label: 'New link', href: '/' });
                    setDoc({ ...doc, [key]: list });
                  }}
                >
                  Add dropdown link
                </button>
              </div>
            ))}
            <div className="mb-7 flex gap-4 text-sm">
              <button
                type="button"
                onClick={() =>
                  setDoc({
                    ...doc,
                    [key]: [
                      ...doc[key],
                      { label: 'New link', href: '/', children: [] },
                    ],
                  })
                }
              >
                + Link
              </button>
              <button type="button" onClick={() => save(key, doc[key])}>
                Save {key === 'navigation' ? 'header' : 'footer'} navigation
              </button>
            </div>
          </section>
        ))}
      {tab === 'content' && (
        <>
          <p className="text-sm text-muted-foreground">
            Reusable public content. FAQ blocks read these same entries wherever
            they appear.
          </p>
          {doc.content.map((c, i) => (
            <div key={c.id} className="mt-4 rounded border p-4">
              <div className="flex gap-3">
                <select
                  aria-label="Content type"
                  className={cls}
                  value={c.kind}
                  onChange={(e) => {
                    const content = structuredClone(doc.content);
                    content[i]!.kind = e.target.value as typeof c.kind;
                    setDoc({ ...doc, content });
                  }}
                >
                  {[
                    'business',
                    'services',
                    'projects',
                    'testimonials',
                    'team',
                    'faqs',
                    'locations',
                    'social',
                  ].map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() =>
                    setDoc({
                      ...doc,
                      content: doc.content.filter((_, n) => n !== i),
                    })
                  }
                >
                  Remove
                </button>
              </div>
              {(['title', 'text', 'image', 'href'] as const).map((key) => (
                <label key={key} className="mt-3 block text-xs capitalize">
                  {key}
                  <textarea
                    className={cls}
                    rows={key === 'text' ? 3 : 1}
                    value={c[key] ?? ''}
                    onChange={(e) => {
                      const content = structuredClone(doc.content);
                      if (e.target.value || key === 'title' || key === 'text')
                        content[i]![key] = e.target.value;
                      else delete content[i]![key];
                      setDoc({ ...doc, content });
                    }}
                  />
                </label>
              ))}
              <label className="mt-2 block text-sm">
                <input
                  type="checkbox"
                  checked={c.published}
                  onChange={(e) => {
                    const content = structuredClone(doc.content);
                    content[i]!.published = e.target.checked;
                    setDoc({ ...doc, content });
                  }}
                />{' '}
                Approved for public display
              </label>
            </div>
          ))}
          <button
            type="button"
            className="mt-4 rounded border px-4 py-2"
            onClick={() =>
              setDoc({
                ...doc,
                content: [
                  ...doc.content,
                  {
                    id: uid(),
                    kind: 'services',
                    title: 'New content',
                    text: '',
                    published: false,
                  },
                ],
              })
            }
          >
            Add content
          </button>
        </>
      )}
      {tab === 'forms' && (
        <>
          <div className="flex gap-3">
            <select
              aria-label="Form"
              className={cls}
              value={selected}
              onChange={(e) => setSelected(Number(e.target.value))}
            >
              {doc.forms.map((f, i) => (
                <option key={f.id} value={i}>
                  {f.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                const forms = [
                  ...doc.forms,
                  {
                    id: uid(),
                    name: 'Consultation enquiry',
                    enabled: true,
                    confirmation: 'Your enquiry has been received.',
                    fields: [
                      {
                        key: 'name',
                        label: 'Name',
                        type: 'text' as const,
                        required: true,
                        mapping: 'name' as const,
                        options: [],
                      },
                      {
                        key: 'phone',
                        label: 'Phone',
                        type: 'phone' as const,
                        required: true,
                        mapping: 'phone' as const,
                        options: [],
                      },
                      {
                        key: 'consent',
                        label: 'I agree to be contacted about this enquiry.',
                        type: 'consent' as const,
                        required: true,
                        mapping: 'consent' as const,
                        options: [],
                      },
                    ],
                  },
                ];
                setDoc({ ...doc, forms });
                setSelected(forms.length - 1);
              }}
            >
              + Form
            </button>
          </div>
          {doc.forms[selected] &&
            (() => {
              const form = doc.forms[selected]!;
              const update = (
                change: (form: WebsiteDocument['forms'][number]) => void,
              ) => {
                const forms = structuredClone(doc.forms);
                change(forms[selected]!);
                setDoc({ ...doc, forms });
              };
              return (
                <>
                  <p className="mt-3 text-xs">
                    Component form reference: {form.id}
                  </p>
                  <label className="mt-4 block text-sm">
                    Form name
                    <input
                      className={cls}
                      value={form.name}
                      onChange={(e) =>
                        update((f) => {
                          f.name = e.target.value;
                        })
                      }
                    />
                  </label>
                  <label className="mt-3 block text-sm">
                    Confirmation message
                    <input
                      className={cls}
                      value={form.confirmation}
                      onChange={(e) =>
                        update((f) => {
                          f.confirmation = e.target.value;
                        })
                      }
                    />
                  </label>
                  <label className="mt-3 block text-sm">
                    <input
                      type="checkbox"
                      checked={form.enabled}
                      onChange={(e) =>
                        update((f) => {
                          f.enabled = e.target.checked;
                        })
                      }
                    />{' '}
                    Enabled
                  </label>
                  {form.fields.map((field, i) => (
                    <div
                      key={i}
                      className="mt-4 grid gap-3 rounded border p-4 sm:grid-cols-3"
                    >
                      {(['key', 'label'] as const).map((k) => (
                        <label key={k} className="text-xs">
                          {k}
                          <input
                            className={cls}
                            value={field[k]}
                            onChange={(e) =>
                              update((f) => {
                                f.fields[i]![k] = e.target.value;
                              })
                            }
                          />
                        </label>
                      ))}
                      <label className="text-xs">
                        Field type
                        <select
                          className={cls}
                          value={field.type}
                          onChange={(e) =>
                            update((f) => {
                              f.fields[i]!.type = e.target
                                .value as typeof field.type;
                            })
                          }
                        >
                          {[
                            'text',
                            'phone',
                            'email',
                            'select',
                            'radio',
                            'checkbox',
                            'textarea',
                            'number',
                            'date',
                            'location',
                            'consent',
                            'hidden',
                          ].map((k) => (
                            <option key={k}>{k}</option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs">
                        CRM mapping
                        <select
                          className={cls}
                          value={field.mapping}
                          onChange={(e) =>
                            update((f) => {
                              f.fields[i]!.mapping = e.target
                                .value as typeof field.mapping;
                            })
                          }
                        >
                          {[
                            'name',
                            'phone',
                            'email',
                            'location',
                            'requirement',
                            'budget',
                            'project_type',
                            'preferred_contact',
                            'message',
                            'consent',
                            'campaign',
                            'extra',
                          ].map((k) => (
                            <option key={k}>{k}</option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs">
                        Choices (one per line)
                        <textarea
                          className={cls}
                          value={field.options.join('\n')}
                          onChange={(e) =>
                            update((f) => {
                              f.fields[i]!.options = e.target.value
                                .split('\n')
                                .filter(Boolean);
                            })
                          }
                        />
                      </label>
                      <label className="text-xs">
                        Hidden value
                        <input
                          className={cls}
                          value={field.value ?? ''}
                          onChange={(e) =>
                            update((f) => {
                              f.fields[i]!.value = e.target.value;
                            })
                          }
                        />
                      </label>
                      <label className="text-sm">
                        <input
                          type="checkbox"
                          checked={field.required}
                          onChange={(e) =>
                            update((f) => {
                              f.fields[i]!.required = e.target.checked;
                            })
                          }
                        />{' '}
                        Required
                      </label>
                      <button
                        type="button"
                        className="text-sm"
                        onClick={() =>
                          update((f) => {
                            f.fields.splice(i, 1);
                          })
                        }
                      >
                        Remove field
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="mt-4 text-sm"
                    onClick={() =>
                      update((f) => {
                        f.fields.push({
                          key: uid(),
                          label: 'New field',
                          type: 'text',
                          required: false,
                          mapping: 'extra',
                          options: [],
                        });
                      })
                    }
                  >
                    + Field
                  </button>
                </>
              );
            })()}
        </>
      )}
      {tab === 'developer' && (
        <>
          <h2 className="font-semibold">Website CSS</h2>
          <textarea
            aria-label="Website CSS"
            spellCheck={false}
            className={`${cls} min-h-48 font-mono`}
            value={doc.css}
            onChange={(e) => setDoc({ ...doc, css: e.target.value })}
          />
          <button
            type="button"
            className="my-3 rounded border px-4 py-2"
            onClick={() => save('css', doc.css)}
          >
            Validate and save CSS
          </button>
          <h2 className="mt-7 font-semibold">Sandboxed frontend components</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            HTML, CSS and vanilla JavaScript. No package imports. The website
            SDK exposes approved public data.
          </p>
          {doc.code.map((c, i) => (
            <div key={c.id} className="mt-5 rounded border p-4">
              <p className="text-xs">Component reference: {c.id}</p>
              <input
                aria-label="Component name"
                className={cls}
                value={c.name}
                onChange={(e) => {
                  const code = structuredClone(doc.code);
                  code[i]!.name = e.target.value;
                  setDoc({ ...doc, code });
                }}
              />
              {(['html', 'css', 'javascript'] as const).map((key) => (
                <label key={key} className="mt-4 block text-xs uppercase">
                  {key}
                  <textarea
                    spellCheck={false}
                    className={`${cls} min-h-40 font-mono`}
                    value={c[key]}
                    onChange={(e) => {
                      const code = structuredClone(doc.code);
                      code[i]![key] = e.target.value;
                      setDoc({ ...doc, code });
                    }}
                  />
                </label>
              ))}
              <button
                type="button"
                className="mt-3 text-sm"
                onClick={() =>
                  setDoc({ ...doc, code: doc.code.filter((_, n) => n !== i) })
                }
              >
                Remove component
              </button>
            </div>
          ))}
          <button
            type="button"
            className="mt-4 rounded border px-4 py-2"
            onClick={() =>
              setDoc({
                ...doc,
                code: [
                  ...doc.code,
                  {
                    id: uid(),
                    name: 'Custom component',
                    html: '<section><h2 id="greeting">Welcome</h2></section>',
                    css: 'section { padding: 32px; }',
                    javascript:
                      'document.querySelector("#greeting").textContent = website.getBusinessProfile().name;',
                  },
                ],
              })
            }
          >
            + Custom component
          </button>
        </>
      )}
    </>
  );
  return (
    <div className="max-w-4xl">
      <fieldset disabled={!canEdit || pending} className="space-y-4">
        {content}
      </fieldset>
      {!['navigation'].includes(tab) && (
        <button
          disabled={!canEdit || pending}
          className="mt-6 rounded bg-primary px-5 py-2 text-primary-foreground"
          onClick={() => save(section, doc[section as keyof WebsiteDocument])}
        >
          Save {tab}
        </button>
      )}
      <p role="status" className="mt-4 text-sm">
        {message}
      </p>
    </div>
  );
}
export function PublicationControls({
  id,
  version,
  versions,
}: {
  id: string;
  version: number;
  versions: {
    id: string;
    sequence: number;
    summary: string;
    created_at: string;
  }[];
}) {
  const [message, setMessage] = useState(''),
    [pending, start] = useTransition();
  return (
    <div className="space-y-5">
      <button
        disabled={pending}
        className="rounded border px-4 py-2"
        onClick={() =>
          start(async () => {
            const r = await changeWebsiteStatus(id, version, 'unpublished');
            setMessage(r.message);
          })
        }
      >
        Unpublish website
      </button>
      {versions.map((v) => (
        <div
          key={v.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded border p-4"
        >
          <div>
            <h2 className="font-semibold">Version {v.sequence}</h2>
            <p className="text-sm">{v.summary}</p>
            <time className="text-xs text-muted-foreground">
              {v.created_at}
            </time>
          </div>
          <button
            disabled={pending}
            className="rounded border px-4 py-2"
            onClick={() =>
              start(async () => {
                const r = await publishWebsite(
                  id,
                  version,
                  `Restore version ${v.sequence}`,
                  v.id,
                );
                setMessage(r.message);
              })
            }
          >
            Restore as new version
          </button>
        </div>
      ))}
      <p role="status">{message}</p>
    </div>
  );
}
