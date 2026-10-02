import { z } from 'zod';

export const componentTypes = [
  'section',
  'container',
  'columns',
  'grid',
  'hero',
  'heading',
  'text',
  'image',
  'video',
  'button',
  'card',
  'gallery',
  'testimonials',
  'faq',
  'team',
  'services',
  'portfolio',
  'contact',
  'lead_form',
  'map',
  'social',
  'logo',
  'navigation',
  'footer',
  'spacer',
  'divider',
  'stats',
  'cta',
  'pricing',
  'before_after',
  'process',
  'embed',
  'custom',
] as const;
export type ComponentType = (typeof componentTypes)[number];
const key = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/);
export function safeUrl(value: string): boolean {
  if (!value || /[\s\\<>\u0000-\u001f\u007f]/.test(value)) return false;
  if (/^\/(?!\/)/.test(value))
    return !/(?:^|\/)(?:\.|\.\.)(?:\/|$)|%2e|%2f|%5c/i.test(value);
  if (/^#[a-zA-Z][\w-]*$/.test(value)) return true;
  try {
    const url = new URL(value);
    return (
      ['https:', 'mailto:', 'tel:'].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
export const urlSchema = z
  .string()
  .max(2048)
  .refine(safeUrl, 'Use a safe HTTPS, page, email or phone link');
export const routeSchema = z
  .string()
  .max(180)
  .regex(/^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$/)
  .refine(
    (v) =>
      !/^\/(?:api|_next|admin|dashboard|auth|preview|assets|robots|sitemap)(?:\/|$)/.test(
        v,
      ),
    'Reserved route',
  );
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const length = z.number().finite().min(0).max(2000);
export const styleSchema = z
  .object({
    color: color.optional(),
    background: color.optional(),
    fontSize: z.number().min(8).max(200).optional(),
    padding: length.optional(),
    gap: length.optional(),
    margin: length.optional(),
    radius: z.number().min(0).max(200).optional(),
    width: z.number().min(1).max(100).optional(),
    maxWidth: length.optional(),
    minHeight: length.optional(),
    columns: z.number().int().min(1).max(12).optional(),
    align: z.enum(['left', 'center', 'right']).optional(),
    display: z.enum(['block', 'flex', 'grid', 'none']).optional(),
    direction: z.enum(['row', 'column']).optional(),
    justify: z.enum(['start', 'center', 'end', 'space-between']).optional(),
    border: color.optional(),
    shadow: z.enum(['none', 'soft', 'strong']).optional(),
    fit: z.enum(['cover', 'contain']).optional(),
  })
  .strict();
export type NodeStyle = z.infer<typeof styleSchema>;
const propsSchema = z
  .object({
    text: z.string().max(12000).optional(),
    title: z.string().max(300).optional(),
    subtitle: z.string().max(1000).optional(),
    href: urlSchema.optional(),
    asset: key.optional(),
    alt: z.string().max(500).optional(),
    level: z.number().int().min(1).max(6).optional(),
    form: key.optional(),
    collection: key.optional(),
    binding: z
      .enum([
        'business',
        'services',
        'projects',
        'testimonials',
        'team',
        'faqs',
        'locations',
        'social',
      ])
      .optional(),
    embed: z.string().max(2048).url().optional(),
    code: key.optional(),
    sticky: z.boolean().optional(),
    label: z.string().max(200).optional(),
    ratio: z.enum(['square', 'portrait', 'landscape', 'wide']).optional(),
  })
  .strict();
export type WebsiteNode = {
  id: string;
  type: ComponentType;
  props: z.infer<typeof propsSchema>;
  style: NodeStyle;
  tablet: NodeStyle;
  mobile: NodeStyle;
  children: WebsiteNode[];
};
export const nodeSchema: z.ZodType<WebsiteNode> = z.lazy(() =>
  z
    .object({
      id: key,
      type: z.enum(componentTypes),
      props: propsSchema,
      style: styleSchema,
      tablet: styleSchema,
      mobile: styleSchema,
      children: z.array(nodeSchema).max(100),
    })
    .strict(),
);
export const themeSchema = z
  .object({
    primary: color,
    secondary: color,
    accent: color,
    background: color,
    surface: color,
    text: color,
    muted: color,
    border: color,
    headingFont: z.enum(['serif', 'sans-serif', 'monospace']),
    bodyFont: z.enum(['serif', 'sans-serif', 'monospace']),
    radius: z.number().min(0).max(64),
    spacing: z.number().min(2).max(32),
    containerWidth: z.number().min(320).max(1920),
    shadow: z.enum(['none', 'soft', 'strong']),
    buttonStyle: z.enum(['solid', 'outline', 'rounded']),
  })
  .strict();
export const defaultTheme: z.infer<typeof themeSchema> = {
  primary: '#343F36',
  secondary: '#DED8CB',
  accent: '#B37D53',
  background: '#FAF8F3',
  surface: '#FFFFFF',
  text: '#242923',
  muted: '#676B63',
  border: '#DED8CB',
  headingFont: 'serif',
  bodyFont: 'sans-serif',
  radius: 4,
  spacing: 8,
  containerWidth: 1200,
  shadow: 'none',
  buttonStyle: 'solid',
};
const seoSchema = z
  .object({
    title: z.string().max(160),
    description: z.string().max(320),
    noindex: z.boolean(),
    canonical: urlSchema.optional(),
    ogTitle: z.string().max(160).optional(),
    ogDescription: z.string().max(320).optional(),
    image: key.optional(),
  })
  .strict();
export const pageSchema = z
  .object({
    id: key,
    path: routeSchema,
    title: z.string().min(1).max(160),
    visibility: z.enum(['public', 'draft']),
    seo: seoSchema,
    nodes: z.array(nodeSchema).max(100),
  })
  .strict();
const fieldSchema = z
  .object({
    key,
    label: z.string().min(1).max(100),
    type: z.enum([
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
    ]),
    required: z.boolean(),
    mapping: z.enum([
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
    ]),
    options: z.array(z.string().min(1).max(100)).max(30),
    value: z.string().max(500).optional(),
  })
  .strict();
export const formSchema = z
  .object({
    id: key,
    name: z.string().min(1).max(160),
    enabled: z.boolean(),
    confirmation: z.string().min(1).max(500),
    fields: z.array(fieldSchema).min(1).max(20),
  })
  .strict()
  .superRefine((form, ctx) => {
    const keys = new Set<string>();
    const mappings = new Set<string>();
    for (const f of form.fields) {
      if (keys.has(f.key))
        ctx.addIssue({ code: 'custom', message: 'Duplicate form field' });
      keys.add(f.key);
      if (f.mapping !== 'extra' && mappings.has(f.mapping))
        ctx.addIssue({ code: 'custom', message: 'Duplicate CRM mapping' });
      mappings.add(f.mapping);
      if (['select', 'radio'].includes(f.type) && !f.options.length)
        ctx.addIssue({ code: 'custom', message: 'Options required' });
    }
    for (const mapping of ['name', 'phone', 'consent'])
      if (
        !form.fields.some(
          (f) => f.mapping === mapping && f.required && f.type !== 'hidden',
        )
      )
        ctx.addIssue({
          code: 'custom',
          message: `Required ${mapping} field missing`,
        });
    if (
      form.fields.some((f) => f.mapping === 'consent' && f.type !== 'consent')
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Consent must be an explicit checkbox',
      });
  });
const contentSchema = z
  .object({
    id: key,
    kind: z.enum([
      'business',
      'services',
      'projects',
      'testimonials',
      'team',
      'faqs',
      'locations',
      'social',
    ]),
    title: z.string().max(300),
    text: z.string().max(12000),
    image: key.optional(),
    href: urlSchema.optional(),
    published: z.boolean(),
    sourceId: z.string().uuid().optional(),
    sourceType: z.enum(['catalog_items', 'projects']).optional(),
  })
  .strict();
const linkSchema = z
  .object({
    label: z.string().min(1).max(100),
    href: urlSchema,
    children: z
      .array(
        z
          .object({ label: z.string().min(1).max(100), href: urlSchema })
          .strict(),
      )
      .max(20),
  })
  .strict();
export const websiteDocumentSchema = z
  .object({
    schemaVersion: z.literal(1),
    settings: z
      .object({
        name: z.string().min(1).max(160),
        locale: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/),
        timezone: z.string().min(1).max(100),
        description: z.string().max(320),
        logo: key.optional(),
        favicon: key.optional(),
        phone: z.string().max(50),
        email: z.string().max(254),
        address: z.string().max(500),
        noindex: z.boolean(),
      })
      .strict(),
    theme: themeSchema,
    css: z.string().max(50000),
    navigation: z.array(linkSchema).max(40),
    footerNavigation: z.array(linkSchema).max(40),
    header: z.array(nodeSchema).max(30),
    footer: z.array(nodeSchema).max(30),
    pages: z.array(pageSchema).min(1).max(200),
    forms: z.array(formSchema).max(50),
    content: z.array(contentSchema).max(500),
    sections: z
      .array(
        z
          .object({
            id: key,
            name: z.string().min(1).max(100),
            node: nodeSchema,
          })
          .strict(),
      )
      .max(100),
    code: z
      .array(
        z
          .object({
            id: key,
            name: z.string().min(1).max(100),
            html: z.string().max(50000),
            css: z.string().max(50000),
            javascript: z.string().max(50000),
          })
          .strict(),
      )
      .max(30),
    assets: z
      .array(
        z
          .object({
            id: key,
            assetId: z.string().uuid(),
            alt: z.string().max(500),
            width: z.number().int().positive().max(12000),
            height: z.number().int().positive().max(12000),
          })
          .strict(),
      )
      .max(500),
  })
  .strict();
export type WebsiteDocument = z.infer<typeof websiteDocumentSchema>;
export function walkNodes(
  nodes: WebsiteNode[],
  visit: (node: WebsiteNode, depth: number) => void,
  depth = 0,
) {
  if (depth > 12) throw new Error('Maximum nesting depth is 12');
  for (const n of nodes) {
    visit(n, depth);
    walkNodes(n.children, visit, depth + 1);
  }
}
export function validateDocument(
  input: unknown,
  publish = false,
): WebsiteDocument {
  // Bound depth before recursive schema parsing, including hostile cyclic input.
  const seen = new WeakSet<object>();
  let objects = 0;
  function guard(v: unknown, d = 0) {
    if (d > 45 || ++objects > 40000)
      throw new Error('Document complexity limit exceeded');
    if (v && typeof v === 'object') {
      if (seen.has(v)) throw new Error('Cyclic document');
      seen.add(v);
      for (const x of Object.values(v)) guard(x, d + 1);
      seen.delete(v);
    }
  }
  guard(input);
  if (JSON.stringify(input).length > 1500000)
    throw new Error('Document exceeds 1.5 MB');
  const doc = websiteDocumentSchema.parse(input);
  const paths = new Set<string>();
  const ids = new Set<string>();
  let count = 0;
  for (const list of [
    doc.pages,
    doc.forms,
    doc.content,
    doc.sections,
    doc.code,
    doc.assets,
  ]) {
    const keys = new Set<string>();
    for (const item of list) {
      if (keys.has(item.id)) throw new Error('Duplicate record identifier');
      keys.add(item.id);
    }
  }
  const publicPaths = new Set(
    doc.pages.filter((p) => p.visibility === 'public').map((p) => p.path),
  );
  const checkLink = (href: string) => {
    if (
      publish &&
      href.startsWith('/') &&
      !publicPaths.has(href.split('#')[0]!.split('?')[0]!)
    )
      throw new Error(`Broken internal link: ${href}`);
  };
  const inspect = (node: WebsiteNode) => {
    if (++count > 2000) throw new Error('Maximum 2000 components');
    if (ids.has(node.id)) throw new Error('Duplicate component identifier');
    ids.add(node.id);
    if (
      node.children.length &&
      ![
        'section',
        'container',
        'columns',
        'grid',
        'hero',
        'card',
        'footer',
        'cta',
        'contact',
      ].includes(node.type)
    )
      throw new Error('This component cannot contain children');
    if (node.props.asset && !doc.assets.some((a) => a.id === node.props.asset))
      throw new Error('Missing asset');
    if (
      publish &&
      node.type === 'image' &&
      (!node.props.asset || !node.props.alt)
    )
      throw new Error('Image and alt text required');
    if (
      node.type === 'lead_form' &&
      !doc.forms.some(
        (f) => f.id === node.props.form && (!publish || f.enabled),
      )
    )
      throw new Error('Missing enabled form');
    if (
      node.type === 'custom' &&
      !doc.code.some((c) => c.id === node.props.code)
    )
      throw new Error('Missing custom component');
    if (node.props.href) checkLink(node.props.href);
  };
  for (const page of doc.pages) {
    if (paths.has(page.path)) throw new Error('Duplicate page route');
    paths.add(page.path);
    if (publish && page.visibility === 'public' && !page.seo.title.trim())
      throw new Error('SEO title required');
    walkNodes(page.nodes, inspect);
  }
  walkNodes(doc.header, inspect);
  walkNodes(doc.footer, inspect);
  for (const n of [...doc.navigation, ...doc.footerNavigation]) {
    checkLink(n.href);
    for (const c of n.children) checkLink(c.href);
  }
  if (publish && !publicPaths.has('/'))
    throw new Error('Publish a home page first');
  return doc;
}
export function createNode(type: ComponentType, id: string): WebsiteNode {
  return {
    id,
    type,
    props: {
      text:
        type === 'heading'
          ? 'A considered space'
          : type === 'text'
            ? 'Tell your story here.'
            : '',
    },
    style: {},
    tablet: {},
    mobile: {},
    children: [],
  };
}
export function emptyWebsite(name = 'My website'): WebsiteDocument {
  return {
    schemaVersion: 1,
    settings: {
      name,
      locale: 'en',
      timezone: 'Asia/Kolkata',
      description: '',
      phone: '',
      email: '',
      address: '',
      noindex: false,
    },
    theme: { ...defaultTheme },
    css: '',
    navigation: [{ label: 'Home', href: '/', children: [] }],
    footerNavigation: [],
    header: [],
    footer: [],
    pages: [
      {
        id: 'home',
        path: '/',
        title: 'Home',
        visibility: 'public',
        seo: { title: name, description: '', noindex: false },
        nodes: [],
      },
    ],
    forms: [],
    content: [],
    sections: [],
    code: [],
    assets: [],
  };
}
