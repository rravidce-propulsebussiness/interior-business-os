'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { serverServices, activeOrganization } from '@business-os/auth/server';
import { DomainError, safeFailure } from '@business-os/shared';
import { createQuotationPackagesRepository } from '@business-os/database/quotation-packages';

export type QuotePackageActionState = { message: string; saved?: boolean };
const schema = z.object({
  id: z.uuid().optional(),
  version: z.number().int().positive().optional(),
  industryKey: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9-]{1,19}$/),
  description: z.string().trim().max(2000),
  pricingBasis: z.enum(['fixed','per_sqft','per_bhk','per_unit']),
  basePrice: z.string().regex(/^(0|[1-9]\d{0,8})(\.\d{1,2})?$/).refine((value) => Number(value)>0),
  currency: z.string().regex(/^[A-Z]{3}$/),
  status: z.enum(['active','inactive']),
}).strict();

export async function saveQuotationPackage(
  _previous: QuotePackageActionState,
  form: FormData,
): Promise<QuotePackageActionState> {
  try {
    const org = await activeOrganization();
    if (!org) throw new DomainError('FORBIDDEN');
    const { authorization, client } = await serverServices();
    await authorization.requirePermission(org.organizationId, 'pricing.manage', { moduleKey: 'pricing' });
    await authorization.requirePermission(org.organizationId, 'pricing.view', { moduleKey: 'pricing' });
    const id = String(form.get('id') ?? '');
    const input = schema.parse({
      ...(id ? { id, version: Number(form.get('version')) } : {}),
      industryKey: String(form.get('industryKey') ?? ''),
      name: String(form.get('name') ?? ''),
      code: String(form.get('code') ?? ''),
      description: String(form.get('description') ?? ''),
      pricingBasis: String(form.get('pricingBasis') ?? ''),
      basePrice: String(form.get('basePrice') ?? ''),
      currency: String(form.get('currency') ?? 'INR'),
      status: form.get('status') === 'inactive' ? 'inactive' : 'active',
    });
    await createQuotationPackagesRepository(client).save(org.organizationId, input);
    revalidatePath('/dashboard/quotations/packages');
    revalidatePath('/dashboard/quotations');
    return { saved: true, message: 'Package saved. Existing issued quotations are unchanged.' };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}
