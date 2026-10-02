import { z } from 'zod';
export const quotationCommandSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('arrange_line'),
      revision_id: z.uuid(),
      version: z.number().int().positive(),
      line_id: z.uuid(),
      area_id: z.uuid().nullable(),
      sort_order: z.number().int().min(0).max(10000),
      optional: z.boolean(),
      description: z.string().max(3000),
    })
    .strict(),
  z
    .object({
      action: z.literal('create'),
      project_id: z.uuid(),
      currency: z.string().regex(/^[A-Z]{3}$/),
    })
    .strict(),
  z
    .object({
      action: z.enum(['issue', 'clone', 'cancel']),
      revision_id: z.uuid(),
      version: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      action: z.enum(['remove_line', 'duplicate_line']),
      revision_id: z.uuid(),
      version: z.number().int().positive(),
      line_id: z.uuid(),
    })
    .strict(),
  z
    .object({
      action: z.literal('edit_revision'),
      revision_id: z.uuid(),
      version: z.number().int().positive(),
      terms: z.string().max(10000),
      customer_notes: z.string().max(10000),
      internal_notes: z.string().max(10000),
      valid_until: z.iso.date(),
      discount: z
        .object({
          kind: z.enum(['none', 'fixed', 'percentage']),
          value: z.string().regex(/^(0|[1-9]\d{0,11})(\.\d{1,6})?$/),
        })
        .strict(),
    })
    .strict(),
]);
export const commercialSearchResultSchema = z.object({
  rows: z.array(
    z.object({
      id: z.uuid(),
      display_name: z.string().optional(),
      name: z.string().optional(),
      quotation_number: z.string().optional(),
      status: z.string(),
      customer_name: z.string().optional(),
      project_name: z.string().optional(),
      amount: z.string().nullable().optional(),
      currency: z.string().optional(),
      revision_number: z.number().optional(),
    }),
  ),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  page_size: z.literal(25),
});
const text = z.string().trim().max(200),
  name = text.min(1),
  note = z.string().max(10000);
export const addressSchema = z
  .object({
    line1: z.string().max(200),
    line2: z.string().max(200),
    city: text,
    region: text,
    postal_code: z.string().max(40),
    country_code: z.string().regex(/^$|^[A-Z]{2}$/),
  })
  .strict();
export const emptyAddress = {
  line1: '',
  line2: '',
  city: '',
  region: '',
  postal_code: '',
  country_code: '',
};
const base = {
  id: z.uuid(),
  organization_id: z.uuid(),
  version: z.number().int().positive(),
};
export const customerSchema = z.object({
  ...base,
  customer_type: z.enum(['individual', 'business']),
  display_name: name,
  legal_name: text,
  phone: z.string().max(40),
  secondary_phone: z.string().max(40),
  email: z.union([z.literal(''), z.email().max(254)]),
  tax_identifier: z.string().max(80),
  billing_address: addressSchema,
  notes: note,
  status: z.enum(['active', 'inactive']),
});
export const contactSchema = z.object({
  ...base,
  customer_id: z.uuid(),
  name,
  role: text,
  phone: z.string().max(40),
  email: z.union([z.literal(''), z.email().max(254)]),
  is_primary: z.boolean(),
});
export const projectSchema = z.object({
  ...base,
  customer_id: z.uuid(),
  name,
  code: z
    .string()
    .regex(/^[A-Za-z0-9_-]+$/)
    .max(64),
  industry_id: z.uuid().nullable(),
  branch_id: z.uuid().nullable(),
  project_type: text,
  site_address: addressSchema,
  status: z.enum(['active', 'inactive']),
  notes: note,
  assigned_user_id: z.uuid().nullable(),
});
export const areaSchema = z.object({
  ...base,
  project_id: z.uuid(),
  parent_id: z.uuid().nullable(),
  name,
  code: z.string().max(64),
  area_type: text,
  sort_order: z.number().int().min(0).max(10000),
  notes: note,
  status: z.enum(['active', 'inactive']),
});
export const brandingSchema = z
  .object({
    name,
    address: addressSchema,
    phone: z.string().max(40),
    email: z.union([z.literal(''), z.email().max(254)]),
    tax_identifier: z.string().max(80),
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    logo_data_uri: z
      .string()
      .max(180000)
      .regex(/^$|^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/),
  })
  .strict();
export const quoteSettingsSchema = z.object({
  ...base,
  prefix: z.string().regex(/^[A-Z][A-Z0-9-]{0,15}$/),
  validity_days: z.number().int().min(1).max(365),
  default_terms: note,
  default_customer_notes: note,
  show_quantity: z.boolean(),
  show_unit_rate: z.boolean(),
  show_specifications: z.boolean(),
  branding: brandingSchema,
});
export const commercialSchemas = {
  customers: customerSchema,
  customer_contacts: contactSchema,
  projects: projectSchema,
  project_areas: areaSchema,
  organization_quotation_settings: quoteSettingsSchema,
};
export type CommercialEntity = keyof typeof commercialSchemas;
export type Customer = z.infer<typeof customerSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Area = z.infer<typeof areaSchema>;
export const searchSchema = z
  .object({
    query: z.string().trim().max(100).default(''),
    page: z.number().int().min(1).max(10000).default(1),
    status: z
      .enum([
        '',
        'draft',
        'issued',
        'superseded',
        'cancelled',
        'active',
        'inactive',
      ])
      .default(''),
    parent_id: z.uuid().nullable().default(null),
  })
  .strict();
