import { z } from 'zod';

const key = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/);
const text = z.string().max(12000);
export const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const fonts = [
  'Arial',
  'Georgia',
  'Verdana',
  'Times New Roman',
  'Trebuchet MS',
] as const;
export function safeLink(value: string): boolean {
  if (!value) return true;
  if (/[\s<>\\\u0000-\u001f\u007f]/.test(value)) return false;
  if (/^#page-[a-zA-Z][\w-]{0,63}$/.test(value)) return true;
  try {
    const u = new URL(value);
    return (
      ['https:', 'mailto:', 'tel:'].includes(u.protocol) &&
      !u.username &&
      !u.password &&
      !/(?:^|\/)(?:dashboard|api|auth|admin)(?:\/|$)/i.test(u.pathname)
    );
  } catch {
    return false;
  }
}
const link = z
  .string()
  .max(2048)
  .refine(safeLink, 'Use a public HTTPS, email, phone or page link');
export const componentTypes = [
  'heading',
  'text',
  'rich_text',
  'image',
  'image_grid',
  'gallery',
  'shape',
  'divider',
  'icon',
  'logo',
  'cta',
  'contact',
  'service',
  'project',
  'testimonial',
  'team',
  'stats',
  'pricing',
  'table',
  'faq',
  'timeline',
  'process',
  'map',
  'social',
  'page_number',
  'header',
  'footer',
  'custom',
  'before_after',
  'material',
  'finish',
  'room_gallery',
  'designer',
  'consultation',
  'group',
] as const;
export const themeSchema = z
  .object({
    primary: color.default('#343f36'),
    secondary: color.default('#d8c9b5'),
    accent: color.default('#9b7449'),
    background: color.default('#faf8f2'),
    surface: color.default('#ffffff'),
    text: color.default('#243128'),
    muted: color.default('#687267'),
    border: color.default('#d8d5cd'),
    headingFont: z.enum(fonts).default('Georgia'),
    bodyFont: z.enum(fonts).default('Arial'),
    radius: z.number().min(0).max(20).default(0),
    spacing: z.number().min(0).max(30).default(5),
    shadow: z.boolean().default(false),
    buttonStyle: z.enum(['solid', 'outline']).default('solid'),
    imageTreatment: z.enum(['none', 'grayscale']).default('none'),
  })
  .strict();
export const styleSchema = z
  .object({
    font: z.enum(fonts).default('Arial'),
    size: z.number().min(6).max(120).default(12),
    weight: z.enum(['normal', 'bold']).default('normal'),
    lineHeight: z.number().min(0.8).max(3).default(1.4),
    letterSpacing: z.number().min(-2).max(10).default(0),
    align: z.enum(['left', 'center', 'right', 'justify']).default('left'),
    color: color.optional(),
    background: color.optional(),
    border: color.optional(),
    borderWidth: z.number().min(0).max(5).default(0),
    radius: z.number().min(0).max(30).default(0),
    padding: z.number().min(0).max(30).default(0),
    opacity: z.number().min(0).max(1).default(1),
    transform: z
      .enum(['none', 'uppercase', 'lowercase', 'capitalize'])
      .default('none'),
    paragraphSpacing: z.number().min(0).max(30).default(3),
  })
  .strict();
export const componentSchema = z
  .object({
    id: key,
    type: z.enum(componentTypes),
    label: z.string().max(120).default(''),
    x: z.number().min(0).max(500),
    y: z.number().min(0).max(500),
    width: z.number().min(1).max(500),
    height: z.number().min(1).max(500),
    rotation: z.number().min(-180).max(180).default(0),
    locked: z.boolean().default(false),
    hidden: z.boolean().default(false),
    group: key.optional(),
    text: text.default(''),
    subtitle: z.string().max(2000).default(''),
    link: link.default(''),
    asset: z.string().uuid().optional(),
    assets: z.array(z.string().uuid()).max(24).default([]),
    alt: z.string().max(500).default(''),
    fit: z.enum(['cover', 'contain']).default('cover'),
    focalX: z.number().min(0).max(100).default(50),
    focalY: z.number().min(0).max(100).default(50),
    rows: z
      .array(z.array(z.string().max(500)).max(8))
      .max(40)
      .default([]),
    columns: z.number().int().min(1).max(6).default(2),
    binding: key.optional(),
    style: styleSchema.default(() => styleSchema.parse({})),
  })
  .strict();
export type Component = z.infer<typeof componentSchema>;
export const formats = {
  'A4 Portrait': [210, 297],
  'A4 Landscape': [297, 210],
  'A5 Portrait': [148, 210],
  'A5 Landscape': [210, 148],
  Square: [210, 210],
} as const;
export const pageSchema = z
  .object({
    id: key,
    name: z.string().min(1).max(120),
    background: color.default('#faf8f2'),
    showHeader: z.boolean().default(false),
    showFooter: z.boolean().default(true),
    components: z.array(componentSchema).max(200),
  })
  .strict();
export const contentSchema = z
  .object({
    id: key,
    kind: z.enum([
      'profile',
      'service',
      'project',
      'material',
      'testimonial',
      'team',
      'faq',
      'contact',
    ]),
    title: z.string().max(200),
    description: text.default(''),
    asset: z.string().uuid().optional(),
    images: z.array(z.string().uuid()).max(24).default([]),
    public: z.boolean().default(false),
    publicPrice: z.string().max(200).default(''),
    location: z.string().max(300).default(''),
    link: link.default(''),
    source: z
      .object({
        kind: z.enum(['catalog_items', 'projects', 'materials']),
        id: z.string().uuid(),
      })
      .strict()
      .optional(),
  })
  .strict();
export const brandSchema = z
  .object({
    tagline: z.string().max(300).default(''),
    about: text.default(''),
    phone: z.string().max(40).default(''),
    email: z.string().max(254).default(''),
    website: link.default(''),
    address: z.string().max(500).default(''),
    logo: z.string().uuid().optional(),
    secondaryLogo: z.string().uuid().optional(),
    theme: themeSchema.default(() => themeSchema.parse({})),
    social: z
      .array(z.object({ label: z.string().max(60), url: link }))
      .max(12)
      .default([]),
  })
  .strict();
export const kitSchema = z
  .object({
    brand: brandSchema.default(() => brandSchema.parse({})),
    content: z.array(contentSchema).max(500).default([]),
    blocks: z
      .array(
        z
          .object({
            id: key,
            name: z.string().max(120),
            components: z.array(componentSchema).max(200),
          })
          .strict(),
      )
      .max(100)
      .default([]),
    types: z
      .array(z.string().min(1).max(100))
      .max(100)
      .default([
        'Company Profile',
        'Services',
        'Project Portfolio',
        'Materials & Finishes',
      ]),
  })
  .strict();
export type MarketingKit = z.infer<typeof kitSchema>;
export const brochureSchema = z
  .object({
    schemaVersion: z.literal(1),
    title: z.string().min(1).max(160),
    type: z.string().min(1).max(100).default('Company Profile'),
    description: z.string().max(1000).default(''),
    format: z
      .enum([
        'A4 Portrait',
        'A4 Landscape',
        'A5 Portrait',
        'A5 Landscape',
        'Square',
        'Custom',
      ])
      .default('A4 Portrait'),
    width: z.number().min(100).max(420).default(210),
    height: z.number().min(100).max(420).default(297),
    margin: z.number().min(0).max(40).default(12),
    bleed: z.number().min(0).max(5).default(0),
    safeArea: z.number().min(0).max(30).default(5),
    theme: themeSchema.default(() => themeSchema.parse({})),
    pages: z.array(pageSchema).min(1).max(100),
    header: z.string().max(300).default(''),
    footer: z.string().max(300).default(''),
    numbering: z
      .object({
        enabled: z.boolean().default(true),
        start: z.number().int().min(1).max(999).default(1),
        hideCover: z.boolean().default(true),
        position: z.enum(['left', 'center', 'right']).default('right'),
      })
      .default(() => ({
        enabled: true,
        start: 1,
        hideCover: true,
        position: 'right' as const,
      })),
    settings: z
      .object({
        sharing: z.boolean().default(false),
        download: z.boolean().default(true),
        index: z.boolean().default(false),
        seoTitle: z.string().max(160).default(''),
        seoDescription: z.string().max(300).default(''),
        cover: z.string().uuid().optional(),
        canonical: link.default(''),
        watermark: z.string().max(80).default(''),
        contactLabel: z.string().max(80).default('Request consultation'),
        contactLink: link.default(''),
      })
      .strict()
      .default(() => ({
        sharing: false,
        download: true,
        index: false,
        seoTitle: '',
        seoDescription: '',
        canonical: '',
        watermark: '',
        contactLabel: 'Request consultation',
        contactLink: '',
      })),
    form: z
      .object({
        enabled: z.boolean().default(false),
        label: z.string().max(100).default('Request consultation'),
        confirmation: z
          .string()
          .max(300)
          .default('Thank you. Your enquiry has been received.'),
        fields: z
          .array(
            z.enum(['email', 'requirement', 'location', 'budget', 'message']),
          )
          .max(5)
          .default(['email', 'requirement', 'message']),
      })
      .strict()
      .default(() => ({
        enabled: false,
        label: 'Request consultation',
        confirmation: 'Thank you. Your enquiry has been received.',
        fields: ['email' as const, 'requirement' as const, 'message' as const],
      })),
  })
  .strict();
export type BrochureDocument = z.infer<typeof brochureSchema>;
export function pageSize(d: BrochureDocument): readonly [number, number] {
  return d.format === 'Custom' ? [d.width, d.height] : formats[d.format];
}
export function validateDocument(input: unknown): BrochureDocument {
  const d = brochureSchema.parse(input);
  const [w, h] = pageSize(d);
  const ids = new Set<string>();
  if (
    d.margin * 2 >= Math.min(w, h) ||
    d.safeArea + d.bleed >= Math.min(w, h) / 2
  )
    throw new Error('Margins exceed page size');
  for (const p of d.pages) {
    if (ids.has(p.id)) throw new Error('Duplicate page');
    ids.add(p.id);
    const nodes = new Set<string>();
    for (const c of p.components) {
      if (nodes.has(c.id)) throw new Error('Duplicate component');
      nodes.add(c.id);
      const rad = (c.rotation * Math.PI) / 180;
      const rw =
        Math.abs(c.width * Math.cos(rad)) + Math.abs(c.height * Math.sin(rad));
      const rh =
        Math.abs(c.width * Math.sin(rad)) + Math.abs(c.height * Math.cos(rad));
      if (
        c.x + c.width / 2 - rw / 2 < -0.001 ||
        c.y + c.height / 2 - rh / 2 < -0.001 ||
        c.x + c.width / 2 + rw / 2 > w + 0.001 ||
        c.y + c.height / 2 + rh / 2 > h + 0.001
      )
        throw new Error(`${p.name}: ${c.label || c.type} exceeds the page`);
    }
  }
  for (const p of d.pages)
    for (const c of p.components)
      if (c.link.startsWith('#page-') && !ids.has(c.link.slice(6)))
        throw new Error('Internal link targets a missing page');
  return d;
}
export function assetReferences(d: BrochureDocument): string[] {
  return [
    ...new Set([
      ...(d.settings.cover ? [d.settings.cover] : []),
      ...d.pages.flatMap((p) =>
        p.components
          .filter((c) => !c.hidden)
          .flatMap((c) => [...(c.asset ? [c.asset] : []), ...c.assets]),
      ),
    ]),
  ];
}
export function emptyBrochure(title = 'Business profile'): BrochureDocument {
  return brochureSchema.parse({
    schemaVersion: 1,
    title,
    pages: [{ id: 'cover', name: 'Cover', components: [] }],
  });
}
export function createComponent(
  type: Component['type'],
  id: string,
): Component {
  return componentSchema.parse({
    id,
    type,
    x: 15,
    y: 20,
    width: 80,
    height: type === 'heading' ? 22 : 45,
    text:
      type === 'heading'
        ? 'Your heading'
        : type === 'text'
          ? 'Tell your story.'
          : '',
    style: {
      size: type === 'heading' ? 28 : 12,
      font: type === 'heading' ? 'Georgia' : 'Arial',
    },
  });
}
export function resolveSnapshot(
  input: unknown,
  kit: MarketingKit,
  businessName: string,
): BrochureDocument {
  const d = validateDocument(input);
  d.pages = d.pages.map((p) => ({
    ...p,
    components: p.components
      .filter((c) => !c.hidden)
      .map((c) => {
        const next = { ...c };
        delete next.group;
        next.locked = false;
        if (c.binding === 'business') {
          next.text = businessName;
        } else if (c.binding === 'tagline') {
          next.text = kit.brand.tagline;
        } else if (c.binding === 'contact') {
          next.text = [
            businessName,
            kit.brand.phone,
            kit.brand.email,
            kit.brand.address,
          ]
            .filter(Boolean)
            .join('\n');
          next.link = kit.brand.website;
        } else if (c.binding === 'logo') {
          if (!kit.brand.logo) throw new Error('Choose a brand logo');
          next.asset = kit.brand.logo;
          next.alt = businessName;
        } else if (c.binding) {
          const item = kit.content.find((x) => x.id === c.binding && x.public);
          if (!item)
            throw new Error(
              'Approve referenced public content before publishing',
            );
          next.text = item.title;
          next.subtitle = [item.description, item.publicPrice, item.location]
            .filter(Boolean)
            .join('\n');
          next.assets = item.images;
          if (item.asset) next.asset = item.asset;
          next.link = item.link;
        }
        delete next.binding;
        return next;
      }),
  }));
  return validateDocument(d);
}
