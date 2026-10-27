'use server';

import { revalidatePath } from 'next/cache';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { serverServices, activeOrganization } from '@business-os/auth/server';
import { DomainError, safeFailure } from '@business-os/shared';
import { createQuotationPackagesRepository } from '@business-os/database/quotation-packages';

export type QuotePackageActionState = { message: string; saved?: boolean };
const schema = z
  .object({
    id: z.uuid().optional(),
    version: z.number().int().positive().optional(),
    industryKey: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
    name: z.string().trim().min(2).max(120),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z][A-Z0-9-]{1,19}$/),
    description: z.string().trim().max(2000),
    pricingBasis: z.enum(['fixed', 'per_sqft', 'per_bhk', 'per_unit']),
    basePrice: z
      .string()
      .regex(/^(0|[1-9]\d{0,8})(\.\d{1,2})?$/)
      .refine((value) => Number(value) > 0),
    currency: z.string().regex(/^[A-Z]{3}$/),
    status: z.enum(['active', 'inactive']),
  })
  .strict();

export async function saveQuotationPackage(
  _previous: QuotePackageActionState,
  form: FormData,
): Promise<QuotePackageActionState> {
  try {
    const org = await activeOrganization();
    if (!org) throw new DomainError('FORBIDDEN');
    const { authorization, client } = await serverServices();
    await authorization.requirePermission(
      org.organizationId,
      'pricing.manage',
      { moduleKey: 'pricing' },
    );
    await authorization.requirePermission(org.organizationId, 'pricing.view', {
      moduleKey: 'pricing',
    });
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
    await createQuotationPackagesRepository(client).save(
      org.organizationId,
      input,
    );
    revalidatePath('/dashboard/quotations/packages');
    revalidatePath('/dashboard/quotations');
    return {
      saved: true,
      message: 'Package saved. Existing issued quotations are unchanged.',
    };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}

export async function duplicateQuotationPackage(
  id: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    const org = await activeOrganization();
    if (!org) throw new DomainError('FORBIDDEN');
    const { authorization, client } = await serverServices();
    await authorization.requirePermission(
      org.organizationId,
      'pricing.manage',
      { moduleKey: 'pricing' },
    );
    await authorization.requirePermission(org.organizationId, 'pricing.view', {
      moduleKey: 'pricing',
    });
    const pkg = (
      await createQuotationPackagesRepository(client).list(org.organizationId)
    ).find((item) => item.id === z.uuid().parse(id));
    if (!pkg) throw new DomainError('NOT_FOUND');
    await createQuotationPackagesRepository(client).save(org.organizationId, {
      industryKey: pkg.industryKey,
      name: (pkg.name.slice(0, 110) + ' (Copy)').slice(0, 120),
      code: (
        pkg.code.slice(0, 13) +
        '-C' +
        randomUUID().slice(0, 4)
      ).toUpperCase(),
      description: pkg.description,
      pricingBasis: pkg.pricingBasis,
      basePrice: pkg.basePrice,
      currency: pkg.currency,
      status: 'inactive',
    });
    revalidatePath('/dashboard/quotations/packages');
    return {
      ok: true,
      message: 'Package duplicated as inactive. Review before activating.',
    };
  } catch (error) {
    return { ok: false, message: safeFailure(error).message };
  }
}

export async function deleteQuotationPackage(
  id: string,
  version: number,
): Promise<{ ok: boolean; message: string }> {
  try {
    const org = await activeOrganization();
    if (!org) throw new DomainError('FORBIDDEN');
    if (!Number.isInteger(version) || version < 1)
      throw new DomainError('VALIDATION_FAILED');
    const { authorization, client } = await serverServices();
    await authorization.requirePermission(
      org.organizationId,
      'pricing.manage',
      { moduleKey: 'pricing' },
    );
    await authorization.requirePermission(org.organizationId, 'pricing.view', {
      moduleKey: 'pricing',
    });
    const rpc = client.rpc.bind(client) as unknown as (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: boolean | null; error: { message?: string } | null }>;
    const { error } = await rpc('quotation_package_delete', {
      p_org: org.organizationId,
      p_package_id: z.uuid().parse(id),
      p_version: version,
    });
    if (error)
      throw new Error(error.message || 'Could not delete this package');
    revalidatePath('/dashboard/quotations/packages');
    revalidatePath('/dashboard/quotations', 'layout');
    return {
      ok: true,
      message: 'Package deleted. Issued quotations remain unchanged.',
    };
  } catch (error) {
    return { ok: false, message: safeFailure(error).message };
  }
}
