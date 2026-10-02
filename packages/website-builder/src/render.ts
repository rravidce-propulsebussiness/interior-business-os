import {
  escapeHtml as e,
  sandboxDocument,
  type WebsiteBuild,
} from './compiler';
import {
  type WebsiteDocument,
  type WebsiteNode,
  type NodeStyle,
} from './model';

const styleNames: Record<string, string> = {
  color: 'color',
  background: 'background-color',
  fontSize: 'font-size',
  padding: 'padding',
  gap: 'gap',
  margin: 'margin',
  radius: 'border-radius',
  width: 'width',
  maxWidth: 'max-width',
  minHeight: 'min-height',
  align: 'text-align',
  display: 'display',
  direction: 'flex-direction',
  justify: 'justify-content',
  fit: 'object-fit',
};
function styles(s: NodeStyle): string {
  return Object.entries(s)
    .map(([k, v]) =>
      k === 'columns'
        ? `grid-template-columns:repeat(${v},minmax(0,1fr));display:grid`
        : k === 'border'
          ? `border:1px solid ${v}`
          : k === 'shadow'
            ? `box-shadow:${v === 'soft' ? '0 10px 30px #00000012' : v === 'strong' ? '0 20px 60px #00000030' : 'none'}`
            : styleNames[k]
              ? `${styleNames[k]}:${v}${typeof v === 'number' ? (k === 'width' ? '%' : 'px') : ''}`
              : '',
    )
    .join(';');
}
export function renderWebsite(
  build: WebsiteBuild,
  path: string,
  options: {
    preview?: boolean;
    assetBase?: string;
    formsEnabled?: boolean;
  } = {},
): {
  body: string;
  css: string;
  title: string;
  description: string;
  noindex: boolean;
  canonical?: string;
  ogTitle: string;
  ogDescription: string;
  image?: string;
} | null {
  const doc = build.document,
    page = doc.pages.find((p) => p.path === path);
  if (!page) return null;
  const asset = (key: string | undefined) => {
    const a = doc.assets.find((a) => a.id === key);
    return a ? `${options.assetBase ?? '/assets/'}${a.assetId}` : '';
  };
  let css = `:root{--primary:${doc.theme.primary};--secondary:${doc.theme.secondary};--accent:${doc.theme.accent};--background:${doc.theme.background};--surface:${doc.theme.surface};--text:${doc.theme.text};--muted:${doc.theme.muted};--border:${doc.theme.border};--radius:${doc.theme.radius}px;--spacing:${doc.theme.spacing}px;--container:${doc.theme.containerWidth}px}*{box-sizing:border-box}body{margin:0;background:var(--background);color:var(--text);font-family:${doc.theme.bodyFont};line-height:1.6}h1,h2,h3,h4{font-family:${doc.theme.headingFont};font-weight:500;line-height:1.12;letter-spacing:-.03em}h1{font-size:clamp(42px,6vw,88px)}h2{font-size:clamp(30px,4vw,56px)}p{max-width:72ch}a{color:inherit}img,video{max-width:100%;height:auto;display:block}button,input,select,textarea{font:inherit}button,a.button{cursor:pointer;background:var(--primary);color:var(--surface);padding:14px 24px;border:1px solid var(--primary);border-radius:var(--radius);display:inline-block;text-decoration:none}a.button{${doc.theme.buttonStyle === 'outline' ? 'background:transparent;color:var(--primary);' : doc.theme.buttonStyle === 'rounded' ? 'border-radius:999px;' : ''}}:focus-visible{outline:3px solid var(--accent);outline-offset:4px}.website-section{padding:64px max(24px,calc((100% - var(--container))/2))}.website-container{max-width:var(--container);margin:auto}.website-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px}.website-card{padding:24px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius)}.website-nav{display:flex;align-items:center;gap:28px;flex-wrap:wrap}.website-nav a{text-decoration:none}.website-logo{font-family:${doc.theme.headingFont};font-size:24px;font-weight:600}.website-eyebrow{text-transform:uppercase;letter-spacing:.2em;font-size:12px;color:var(--muted)}.website-caption{color:var(--muted);font-size:14px}.website-form{max-width:680px;display:grid;grid-template-columns:1fr 1fr;gap:20px}.website-form label{display:grid;gap:6px;font-size:14px}.website-form input:not([type=checkbox]),.website-form textarea,.website-form select{width:100%;padding:12px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);color:var(--text)}.website-form .wide{grid-column:1/-1}.website-form .consent{display:flex;align-items:center}.website-custom{width:100%;min-height:320px;border:0}.skip{position:absolute;top:-80px;left:16px;z-index:100;background:white;padding:10px}.skip:focus{top:16px}details{border-bottom:1px solid var(--border);padding:18px 0}summary{cursor:pointer;font-weight:600}@media(max-width:900px){.website-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:600px){.website-grid,.website-form{grid-template-columns:1fr}.website-section{padding:40px 20px}.website-nav{gap:16px}.website-form .wide{grid-column:auto}}`;
  function nav(links: WebsiteDocument['navigation']) {
    return `<nav class="website-nav" aria-label="Website navigation">${links.map((l) => (l.children.length ? `<details><summary>${e(l.label)}</summary><a href="${e(l.href)}">${e(l.label)}</a>${l.children.map((c) => `<a href="${e(c.href)}">${e(c.label)}</a>`).join('')}</details>` : `<a href="${e(l.href)}">${e(l.label)}</a>`)).join('')}</nav>`;
  }
  function form(id: string | undefined) {
    const f = doc.forms.find((f) => f.id === id && f.enabled);
    if (!f || options.formsEnabled === false) return '';
    return `<form class="website-form" method="post" action="/api/enquiry"><input type="hidden" name="_form" value="${e(f.id)}"><input type="hidden" name="_page" value="${e(page!.path)}"><div hidden aria-hidden="true"><label>Leave empty<input name="_company" tabindex="-1" autocomplete="off"></label></div>${f.fields
      .filter((f) => f.type !== 'hidden')
      .map((f) => {
        const required = f.required ? ' required' : '';
        const label = `${e(f.label)}${f.required ? ' *' : ''}`;
        if (f.type === 'consent' || f.type === 'checkbox')
          return `<label class="wide consent"><input type="checkbox" name="${e(f.key)}" value="true"${required}>${label}</label>`;
        if (f.type === 'textarea')
          return `<label class="wide">${label}<textarea name="${e(f.key)}" maxlength="2000" rows="4"${required}></textarea></label>`;
        if (f.type === 'radio')
          return `<fieldset><legend>${label}</legend>${f.options.map((o) => `<label><input type="radio" name="${e(f.key)}" value="${e(o)}"${required}>${e(o)}</label>`).join('')}</fieldset>`;
        if (f.type === 'select')
          return `<label>${label}<select name="${e(f.key)}"${required}><option value="">Choose…</option>${f.options.map((o) => `<option>${e(o)}</option>`).join('')}</select></label>`;
        return `<label>${label}<input name="${e(f.key)}" type="${f.type === 'phone' ? 'tel' : ['email', 'number', 'date'].includes(f.type) ? f.type : 'text'}" maxlength="2000"${required}></label>`;
      })
      .join(
        '',
      )}<button class="wide"${options.preview ? ' disabled' : ''}>Send enquiry</button><p class="wide website-caption">${options.preview ? 'Forms are disabled in preview.' : 'Your details are sent only to this business.'}</p></form>`;
  }
  function render(node: WebsiteNode): string {
    css += `#${node.id}{${styles(node.style)}}@media(max-width:900px){#${node.id}{${styles(node.tablet)}}}@media(max-width:600px){#${node.id}{${styles(node.mobile)}}}`;
    const p = node.props,
      children = node.children.map(render).join(''),
      id = `id="${node.id}" data-website-node="${node.id}"`,
      text = e(p.text ?? ''),
      title = e(p.title ?? ''),
      subtitle = e(p.subtitle ?? '');
    if (node.type === 'heading') {
      const level = p.level ?? 2;
      return `<h${level} ${id}>${(text || title).replaceAll('\n', '<br>')}</h${level}>`;
    }
    if (node.type === 'text')
      return `<p ${id}>${text.replaceAll('\n', '<br>')}</p>`;
    if (node.type === 'image' || (node.type === 'logo' && p.asset)) {
      const a = doc.assets.find((a) => a.id === p.asset);
      return a
        ? `<img ${id} src="${e(asset(p.asset))}" width="${a.width}" height="${a.height}" alt="${e(p.alt ?? a.alt)}" loading="lazy">`
        : '';
    }
    if (node.type === 'logo')
      return `<a ${id} class="website-logo" href="/">${text || e(doc.settings.name)}</a>`;
    if (node.type === 'button')
      return `<a ${id} class="button" href="${e(p.href ?? '/')}">${text || e(p.label ?? 'Learn more')}</a>`;
    if (node.type === 'navigation')
      return `<div ${id}>${nav(doc.navigation)}</div>`;
    if (node.type === 'lead_form') return `<div ${id}>${form(p.form)}</div>`;
    if (node.type === 'divider') return `<hr ${id}>`;
    if (node.type === 'spacer')
      return `<div ${id} aria-hidden="true" style="height:32px"></div>`;
    if (node.type === 'custom') {
      const c = build.artifacts.find((c) => c.id === p.code);
      if (!c) return '';
      const data = {
        business: doc.settings,
        services: doc.content.filter((c) => c.kind === 'services'),
        projects: doc.content.filter((c) => c.kind === 'projects'),
        testimonials: doc.content.filter((c) => c.kind === 'testimonials'),
        faqs: doc.content.filter((c) => c.kind === 'faqs'),
      };
      return `<iframe ${id} class="website-custom" title="${e(c.id)}" sandbox="allow-scripts" referrerpolicy="no-referrer" srcdoc="${e(sandboxDocument(c, data))}"></iframe>`;
    }
    if (node.type === 'video' && p.asset)
      return (
        '<video ' +
        id +
        ' controls preload="metadata" src="' +
        e(asset(p.asset)) +
        '"></video>'
      );
    if (['embed', 'video', 'map'].includes(node.type)) {
      if (!p.embed) return '';
      const u = new URL(p.embed);
      if (
        u.protocol !== 'https:' ||
        ![
          'www.youtube-nocookie.com',
          'www.google.com',
          'www.openstreetmap.org',
        ].includes(u.hostname)
      )
        return '';
      return `<iframe ${id} title="${e(p.title ?? node.type)}" src="${e(p.embed)}" loading="lazy" referrerpolicy="no-referrer" sandbox="allow-scripts allow-presentation" style="width:100%;min-height:360px;border:0"></iframe>`;
    }
    if (
      [
        'services',
        'portfolio',
        'testimonials',
        'team',
        'faq',
        'gallery',
        'before_after',
        'process',
        'stats',
        'pricing',
        'social',
      ].includes(node.type)
    ) {
      const kind =
        p.binding ??
        (
          {
            portfolio: 'projects',
            faq: 'faqs',
            gallery: 'projects',
            before_after: 'projects',
            pricing: 'services',
            process: 'services',
            stats: 'business',
          } as Record<string, string>
        )[node.type] ??
        node.type;
      const items = doc.content.filter(
        (c) =>
          c.kind === kind &&
          c.published &&
          (!p.collection || c.id === p.collection),
      );
      return `<div ${id}>${title ? `<h2>${title}</h2>` : ''}<div class="${node.type === 'faq' ? '' : 'website-grid'}">${items.map((item) => (node.type === 'faq' ? `<details><summary>${e(item.title)}</summary><p>${e(item.text)}</p></details>` : `<article class="website-card">${item.image ? `<img src="${e(asset(item.image))}" alt="${e(item.title)}" loading="lazy">` : ''}<h3>${e(item.title)}</h3><p>${e(item.text)}</p>${item.href ? `<a href="${e(item.href)}">Explore →</a>` : ''}</article>`)).join('')}</div></div>`;
    }
    const tag =
      node.type === 'section' || node.type === 'hero' || node.type === 'cta'
        ? 'section'
        : node.type === 'footer'
          ? 'footer'
          : 'div';
    const className = ['section', 'hero', 'cta', 'footer', 'contact'].includes(
      node.type,
    )
      ? 'website-section'
      : node.type === 'grid' || node.type === 'columns'
        ? 'website-grid'
        : node.type === 'card'
          ? 'website-card'
          : 'website-container';
    return `<${tag} ${id} class="${className}">${subtitle ? `<p class="website-eyebrow">${subtitle}</p>` : ''}${title ? `<h${node.type === 'hero' ? '1' : '2'}>${title}</h${node.type === 'hero' ? '1' : '2'}>` : ''}${text ? `<p>${text}</p>` : ''}${children}</${tag}>`;
  }
  const header = doc.header.length
    ? doc.header.map(render).join('')
    : `<header class="website-section" style="padding-top:24px;padding-bottom:24px"><div class="website-nav"><a class="website-logo" href="/">${e(doc.settings.name)}</a>${nav(doc.navigation)}</div></header>`;
  const footer = doc.footer.length
    ? doc.footer.map(render).join('')
    : `<footer class="website-section"><h2>${e(doc.settings.name)}</h2>${nav(doc.footerNavigation)}<p>${e(doc.settings.address)}</p><p>${e(doc.settings.phone)} ${e(doc.settings.email)}</p></footer>`;
  const body = `<a class="skip" href="#main-content">Skip to content</a>${header}<main id="main-content" tabindex="-1">${page.nodes.map(render).join('')}</main>${footer}`;
  return {
    body,
    css: css + doc.css,
    title: page.seo.title || doc.settings.name,
    description: page.seo.description || doc.settings.description,
    noindex: !!options.preview || doc.settings.noindex || page.seo.noindex,
    ...(page.seo.canonical ? { canonical: page.seo.canonical } : {}),
    ogTitle: page.seo.ogTitle || page.seo.title,
    ogDescription: page.seo.ogDescription || page.seo.description,
    ...(page.seo.image ? { image: asset(page.seo.image) } : {}),
  };
}
export function websiteHtml(
  build: WebsiteBuild,
  path: string,
  options: Parameters<typeof renderWebsite>[2] = {},
): string | null {
  const r = renderWebsite(build, path, options);
  if (!r) return null;
  return `<!doctype html><html lang="${e(build.document.settings.locale)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(r.title)}</title><meta name="description" content="${e(r.description)}"><meta name="robots" content="${r.noindex ? 'noindex,nofollow' : 'index,follow'}"><style>${r.css}</style></head><body>${r.body}${options.preview ? `<script>document.addEventListener("click",function(event){event.preventDefault();const node=event.target.closest("[data-website-node]");if(node)parent.postMessage({type:"website.select",id:node.dataset.websiteNode},"*");});</script>` : ''}</body></html>`;
}
