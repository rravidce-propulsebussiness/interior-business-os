'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { serverServices, activeOrganization } from '@business-os/auth/server';
import { createConstructionRatesRepository } from '@business-os/database/construction-rates';
import { idSchema, DomainError, safeFailure } from '@business-os/shared';

export type RateActionState = { message: string; saved?: boolean };

const schema = z
  .object({
    id: idSchema.optional(),
    version: z.number().int().positive().optional(),
    category: z.string().trim().min(2).max(50),
    name: z.string().trim().min(2).max(120),
    specification: z.string().trim().max(250),
    unitPrice: z.string().regex(/^(0|[1-9]\d{0,6})(\.\d{1,2})?$/),
    consumptionPerSqft: z.string().regex(/^(0|[1-9]\d{0,3})(\.\d{1,4})?$/)
      .refine(value => Number(value) > 0),
    priceUnit: z.enum(['sqft','kg','tonne','bag','piece','brick','cft',
      'litre','meter','running_ft','bathroom','door','point','lumpsum']),
    status: z.enum(['active', 'inactive']),
  })
  .strict();

export async function saveConstructionRate(
  _old: RateActionState,
  form: FormData,
): Promise<RateActionState> {
  try {
    const context = await activeOrganization();
    if (!context) throw new DomainError('FORBIDDEN');
    const { authorization, client } = await serverServices();
    await authorization.requirePermission(
      context.organizationId,
      'pricing.manage',
      { moduleKey: 'pricing' },
    );
    await authorization.requirePermission(
      context.organizationId,
      'pricing.view',
      { moduleKey: 'pricing' },
    );
    const id = String(form.get('id') ?? '');
    const validated = schema.parse({
      ...(id ? { id, version: Number(form.get('version')) } : {}),
      category: String(form.get('category') ?? ''),
      name: String(form.get('name') ?? ''),
      specification: String(form.get('specification') ?? ''),
      unitPrice: String(form.get('unitPrice') ?? ''),
      consumptionPerSqft: String(form.get('consumptionPerSqft') ?? ''),
      priceUnit: String(form.get('priceUnit') ?? 'sqft'),
      status: form.get('status') === 'inactive' ? 'inactive' : 'active',
    });
    const effectiveRate = Number(validated.unitPrice) * Number(validated.consumptionPerSqft);
    if (!Number.isFinite(effectiveRate) || effectiveRate > 1000000)
      throw new DomainError('VALIDATION_FAILED');
    await createConstructionRatesRepository(client).save(
      context.organizationId,
      { ...validated, ratePerSqft: effectiveRate.toFixed(2) },
    );
    revalidatePath('/dashboard/pricing/construction');
    revalidatePath('/dashboard/quotations', 'layout');
    return {
      saved: true,
      message:
        'Material rate saved. Existing issued quotations remain unchanged.',
    };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}


/** Persist the Custom Package's chosen default brands and SFT consumption
 * in one authorized database transaction (never client-calculated prices). */
export async function saveCustomPackageSettings(input: unknown): Promise<{
  ok: boolean; message: string;
}> {
  try {
    const rows = z.array(z.object({
      id: idSchema,
      version: z.number().int().positive(),
      consumptionPerSqft: z.string()
        .regex(/^(0|[1-9][0-9]{0,3})(\.[0-9]{1,4})?$/)
        .refine(value => Number(value) > 0 && Number(value) <= 1000),
    }).strict()).max(30).parse(input);
    const context = await activeOrganization();
    if (!context) throw new DomainError('FORBIDDEN');
    const { authorization, client } = await serverServices();
    await authorization.requirePermission(context.organizationId,
      'pricing.manage', { moduleKey: 'pricing' });
    await authorization.requirePermission(context.organizationId,
      'pricing.view', { moduleKey: 'pricing' });
    const result = await createConstructionRatesRepository(client)
      .saveCustomSettings(context.organizationId, rows);
    revalidatePath('/dashboard/quotations/packages');
    revalidatePath('/dashboard/quotations', 'layout');
    return { ok: true, message: result.saved +
      ' material selections saved. New Custom Quotes can start with these brands.' };
  } catch (error) {
    return { ok: false, message: safeFailure(error).message };
  }
}
