import type {
  WebsiteDocument,
  WebsiteNode,
} from '@business-os/website-builder';

export type CodeField = 'html' | 'css' | 'javascript';
export type SourceFile = {
  key: string;
  path: string;
  content: string;
  field: CodeField;
  codeId: string | null;
  readonly?: boolean;
};

const slug = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 55) || 'component';

export function workspaceFiles(document: WebsiteDocument): SourceFile[] {
  const files: SourceFile[] = [
    {
      key: 'global:css',
      path: 'styles/global.css',
      content: document.css,
      codeId: null,
      field: 'css',
    },
  ];
  for (const c of document.code) {
    const page = /^pages\/([a-z0-9]+(?:-[a-z0-9]+)*)\.html$/.exec(c.name);
    const component = /^components\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(c.name);
    const name =
      page?.[1] ?? component?.[1] ?? slug(c.name) + '-' + c.id.slice(-6);
    const base = page ? 'pages' : 'components';
    const fields: { field: CodeField; path: string }[] = [
      {
        field: 'html',
        path: page
          ? 'pages/' + name + '.html'
          : 'components/' + name + '/index.html',
      },
      { field: 'css', path: 'styles/' + base + '/' + name + '.css' },
      { field: 'javascript', path: 'scripts/' + base + '/' + name + '.js' },
    ];
    for (const entry of fields)
      files.push({
        key: c.id + ':' + entry.field,
        content: c[entry.field],
        path: entry.path,
        field: entry.field,
        codeId: c.id,
      });
  }
  return files;
}

export function changeSourceFile(
  document: WebsiteDocument,
  file: SourceFile,
  value: string,
): WebsiteDocument {
  if (value.length > 50000)
    throw new Error('Maximum 50,000 characters per file');
  if (file.codeId === null) return { ...document, css: value };
  return {
    ...document,
    code: document.code.map((c) =>
      c.id === file.codeId ? { ...c, [file.field]: value } : c,
    ),
  };
}

export function newSourceComponent(
  document: WebsiteDocument,
  category: 'components' | 'pages',
  requestedName: string,
  id: string,
): WebsiteDocument {
  const name = slug(requestedName);
  if (document.code.length >= 30)
    throw new Error('Maximum 30 custom code groups per site');
  const path =
    category === 'pages' ? 'pages/' + name + '.html' : 'components/' + name;
  if (document.code.some((c) => c.name === path))
    throw new Error('A file with this name already exists');
  const next = {
    ...document,
    code: [
      ...document.code,
      {
        id,
        name: path,
        html:
          category === 'pages'
            ? '<main><h1>' + name.replaceAll('-', ' ') + '</h1></main>'
            : '<section><h2>New component</h2></section>',
        css: '',
        javascript: '',
      },
    ],
  };
  if (category !== 'pages') return next;
  const route = name === 'index' ? '/' : '/' + name;
  const existing = document.pages.find((p) => p.path === route);
  if (existing && existing.nodes.length > 0)
    throw new Error(
      'Page already contains visual content. Edit it in Template Builder or use a new URL.',
    );
  const node: WebsiteNode = {
    id: 'n' + id.slice(1, 17),
    type: 'custom',
    props: { code: id },
    children: [],
    style: {},
    tablet: {},
    mobile: {},
  };
  if (existing)
    return {
      ...next,
      pages: next.pages.map((p) =>
        p.id === existing.id ? { ...p, nodes: [node] } : p,
      ),
    };
  if (next.pages.length >= 200) throw new Error('Page limit reached');
  return {
    ...next,
    pages: [
      ...next.pages,
      {
        id: 'p' + id.slice(1, 17),
        path: route,
        title: name.replaceAll('-', ' '),
        visibility: 'public' as const,
        seo: {
          title: name.replaceAll('-', ' '),
          description: '',
          noindex: true,
        },
        nodes: [node],
      },
    ],
  };
}

export function renameSourceComponent(
  document: WebsiteDocument,
  codeId: string,
  requestedName: string,
): WebsiteDocument {
  const name = slug(requestedName);
  const existing = document.code.find((c) => c.id === codeId);
  if (!existing) throw new Error('Component not found');
  if (existing.name.startsWith('pages/'))
    throw new Error(
      'Rename page routes from the visual Pages editor to keep links consistent',
    );
  if (
    document.code.some(
      (c) => c.id !== codeId && c.name === 'components/' + name,
    )
  )
    throw new Error('A component with this name already exists');
  return {
    ...document,
    code: document.code.map((c) =>
      c.id === codeId ? { ...c, name: 'components/' + name } : c,
    ),
  };
}

export function removeSourceComponent(
  document: WebsiteDocument,
  codeId: string,
): WebsiteDocument {
  const component = document.code.find((c) => c.id === codeId);
  if (!component) throw new Error('Component unavailable');
  const references = (nodes: WebsiteNode[]): boolean =>
    nodes.some(
      (node) =>
        (node.type === 'custom' && node.props.code === codeId) ||
        references(node.children),
    );
  if (
    [
      ...document.pages.flatMap((p) => p.nodes),
      ...document.header,
      ...document.footer,
      ...document.sections.map((s) => s.node),
    ].some((n) => references([n]))
  )
    throw new Error(
      'This component is used by a page. Remove its Custom block first.',
    );
  return { ...document, code: document.code.filter((c) => c.id !== codeId) };
}
