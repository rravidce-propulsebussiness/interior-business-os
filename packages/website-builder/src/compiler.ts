import { parse as parseJavaScript } from 'acorn';
import postcss from 'postcss';
import { parseFragment } from 'parse5';
import {
  validateDocument,
  safeUrl,
  walkNodes,
  type WebsiteDocument,
} from './model';

export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
}
export function validateCss(css: string): string {
  if (
    css.length > 50000 ||
    /[<>\\]|\b(?:url|expression)\s*\(|@(?:import|font-face|namespace)|-moz-binding|behavior\s*:/i.test(
      css,
    )
  )
    throw new Error('CSS cannot load resources or contain executable markup');
  const root = postcss.parse(css);
  let rules = 0;
  root.walk((node) => {
    if (++rules > 3000) throw new Error('CSS complexity limit');
    if (
      node.type === 'atrule' &&
      !['media', 'supports', 'keyframes'].includes(node.name.toLowerCase())
    )
      throw new Error('Unsupported CSS rule');
  });
  return root.toString();
}
const htmlTags = new Set(
  'div section article header footer main aside nav h1 h2 h3 h4 h5 h6 p span strong em b i small br hr ul ol li dl dt dd details summary a button label input select option textarea form table thead tbody tr th td figure figcaption img blockquote'.split(
    ' ',
  ),
);
type HtmlNode = {
  nodeName: string;
  value?: string;
  tagName?: string;
  attrs?: { name: string; value: string }[];
  childNodes?: HtmlNode[];
};
export function sanitizeHtml(html: string): string {
  const root = parseFragment(html) as HtmlNode;
  const render = (node: HtmlNode): string => {
    if (node.nodeName === '#text') return escapeHtml(node.value);
    if (!node.tagName) return (node.childNodes ?? []).map(render).join('');
    if (!htmlTags.has(node.tagName))
      throw new Error(`Unsupported custom HTML tag: ${node.tagName}`);
    const attrs = (node.attrs ?? [])
      .map((a) => {
        if (
          !/^(?:id|class|title|role|aria-[a-z-]+|data-[a-z-]+|href|alt|type|name|value|placeholder|required|checked|disabled|colspan|rowspan)$/.test(
            a.name,
          )
        )
          throw new Error(`Unsupported HTML attribute: ${a.name}`);
        if (a.name === 'href' && !safeUrl(a.value))
          throw new Error('Unsafe HTML link');
        return ` ${a.name}="${escapeHtml(a.value)}"`;
      })
      .join('');
    return `<${node.tagName}${attrs}>${(node.childNodes ?? []).map(render).join('')}${['br', 'hr', 'input', 'img'].includes(node.tagName) ? '' : `</${node.tagName}>`}`;
  };
  return render(root);
}
const deniedIdentifiers = new Set([
  'eval',
  'Function',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'Worker',
  'SharedWorker',
  'ServiceWorker',
  'importScripts',
  'navigator',
  'location',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'caches',
  'parent',
  'top',
  'opener',
  'frames',
  'globalThis',
  'window',
  'self',
  'process',
  'require',
  'module',
  'exports',
]);
const deniedProperties = new Set([
  'constructor',
  'prototype',
  '__proto__',
  'cookie',
  'domain',
  'defaultView',
  'ownerDocument',
  'innerHTML',
  'outerHTML',
  'insertAdjacentHTML',
  'write',
  'writeln',
  'src',
  'srcdoc',
  'action',
  'formAction',
  'setAttribute',
  'setAttributeNS',
  'location',
  'parent',
  'top',
  'opener',
]);
export function validateJavaScript(source: string): string {
  if (
    source.length > 50000 ||
    /<\/script|(?:service_role|SUPABASE_SERVICE|JWT_SECRET|BEGIN (?:RSA )?PRIVATE KEY)|\b(?:sk_live_|eyJ[A-Za-z0-9_-]{30})/i.test(
      source,
    )
  )
    throw new Error('Code contains prohibited markup or a possible secret');
  const ast = parseJavaScript(source, {
    ecmaVersion: 2025,
    sourceType: 'script',
  });
  let count = 0;
  const inspect = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    if (++count > 15000) throw new Error('Code complexity limit');
    const n = value as Record<string, unknown>;
    if (
      n.type === 'ImportExpression' ||
      n.type === 'ImportDeclaration' ||
      n.type === 'WithStatement' ||
      n.type === 'DebuggerStatement'
    )
      throw new Error('Unsupported code capability');
    if (n.type === 'Identifier' && deniedIdentifiers.has(String(n.name)))
      throw new Error(`Unavailable API: ${n.name}`);
    if (n.type === 'MemberExpression') {
      const p = n.property as Record<string, unknown>;
      if (n.computed && p.type !== 'Literal')
        throw new Error('Computed access requires a literal key');
      const name = String(n.computed ? p.value : p.name);
      if (deniedProperties.has(name))
        throw new Error(`Unavailable property: ${name}`);
    }
    for (const [key, item] of Object.entries(n)) {
      if (['start', 'end'].includes(key)) continue;
      if (Array.isArray(item)) item.forEach(inspect);
      else if (typeof item === 'object') inspect(item);
    }
  };
  inspect(ast);
  return source;
}
export type CompiledCode = {
  id: string;
  html: string;
  css: string;
  javascript: string;
};
export type WebsiteBuild = {
  schemaVersion: 1;
  document: WebsiteDocument;
  artifacts: CompiledCode[];
};
export function compileWebsite(input: unknown): WebsiteBuild {
  const document = validateDocument(input);
  document.pages = document.pages.filter((p) => p.visibility === 'public');
  const assets = new Set<string>(),
    forms = new Set<string>(),
    code = new Set<string>();
  for (const nodes of [
    document.header,
    document.footer,
    ...document.pages.map((p) => p.nodes),
  ])
    walkNodes(nodes, (n) => {
      if (n.props.asset) assets.add(n.props.asset);
      if (n.props.form) forms.add(n.props.form);
      if (n.props.code) code.add(n.props.code);
    });
  for (const c of document.content)
    if (c.published && c.image) assets.add(c.image);
  for (const p of document.pages) if (p.seo.image) assets.add(p.seo.image);
  if (document.settings.logo) assets.add(document.settings.logo);
  if (document.settings.favicon) assets.add(document.settings.favicon);
  document.assets = document.assets.filter((a) => assets.has(a.id));
  document.forms = document.forms.filter((f) => forms.has(f.id));
  document.code = document.code.filter((c) => code.has(c.id));
  document.sections = [];
  validateDocument(document, true);
  validateCss(document.css);
  const artifacts = document.code.map((c) => ({
    id: c.id,
    html: sanitizeHtml(c.html),
    css: validateCss(c.css),
    javascript: validateJavaScript(c.javascript),
  }));
  // Remove authoring-only and explicitly private content from the published projection.
  document.pages = document.pages.filter((p) => p.visibility === 'public');
  document.content = document.content
    .filter((c) => c.published)
    .map((c) => {
      const { sourceId, sourceType, ...safe } = c;
      void sourceId;
      void sourceType;
      return safe;
    });
  document.sections = [];
  return { schemaVersion: 1, document, artifacts };
}
export function sandboxDocument(
  code: CompiledCode,
  publicData: unknown,
): string {
  const data = JSON.stringify(publicData).replace(/</g, '\\u003c');
  const sdk = `const publicData=Object.freeze(${data});const website=Object.freeze({getBusinessProfile:()=>publicData.business,getPublicServices:()=>publicData.services,getPublicProjects:()=>publicData.projects,getPublicTestimonials:()=>publicData.testimonials,getPublicFAQs:()=>publicData.faqs});`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'none'; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'"><meta name="referrer" content="no-referrer"><style>${code.css}</style></head><body>${code.html}<script>${sdk}\n${code.javascript}\n</script></body></html>`;
}
