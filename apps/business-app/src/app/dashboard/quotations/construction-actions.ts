'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createConstructionRatesRepository } from '@business-os/database/construction-rates';
import { DomainError, idSchema, safeFailure } from '@business-os/shared';
import { commercialServices } from '../commercial/service';

const selectionSchema = z
  .object({
    ids: z
      .array(idSchema)
      .min(1)
      .max(20)
      .refine((x) => new Set(x).size === x.length),
    areaSqft: z
      .string()
      .regex(/^(0|[1-9]\d{0,5})(\.\d{1,2})?$/)
      .refine((x) => Number(x) > 0),
  })
  .strict();

const editable = async (revisionId: string, needWrite: boolean) => {
  const s = await commercialServices(
    needWrite ? 'quotation.edit' : 'quotation.view',
    'quotation',
  );
  if (needWrite) {
    await s.authorization.requirePermission(s.org, 'quotation.override_rate', {
      moduleKey: 'quotation',
    });
  }
  await s.authorization.requirePermission(s.org, 'pricing.view', {
    moduleKey: 'pricing',
  });
  const { data: revision, error } = await s.client
    .from('quotation_revisions')
    .select('currency,status,version')
    .eq('organization_id', s.org)
    .eq('id', revisionId)
    .maybeSingle();
  if (
    error ||
    !revision ||
    revision.status !== 'draft' ||
    revision.currency !== 'INR'
  )
    throw new DomainError('VALIDATION_FAILED');
  return { s, revision };
};

export async function previewConstructionPackage(
  revisionId: string,
  input: unknown,
): Promise<{ message: string; total?: string; ratePerSqft?: string }> {
  try {
    const id = idSchema.parse(revisionId),
      value = selectionSchema.parse(input);
    const { s } = await editable(id, false);
    const p = await createConstructionRatesRepository(s.client).preview(
      s.org,
      value.ids,
      value.areaSqft,
    );
    return {
      message: 'Live price calculated from your saved company rates.',
      total: p.total,
      ratePerSqft: p.ratePerSqft,
    };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}

export async function saveConstructionPackage(
  revisionId: string,
  version: number,
  input: unknown,
): Promise<{ message: string; id?: string }> {
  try {
    const rid = idSchema.parse(revisionId),
      value = selectionSchema.parse(input);
    if (!Number.isInteger(version) || version < 1)
      throw new DomainError('VALIDATION_FAILED');
    const { s, revision } = await editable(rid, true);
    if (revision.version !== version) throw new DomainError('CONFLICT');
    const p = await createConstructionRatesRepository(s.client).preview(
      s.org,
      value.ids,
      value.areaSqft,
    );
    const breakdown = p.options
      .map(
        (o) =>
          o.category +
          ': ' +
          o.name +
          (o.specification ? ' — ' + o.specification : '') +
          ' (₹' +
          o.ratePerSqft +
          '/built-up sq ft)',
      )
      .join('\n');
    if (breakdown.length > 3000) throw new DomainError('VALIDATION_FAILED');
    if (Number(p.ratePerSqft) <= 0) throw new DomainError('VALIDATION_FAILED');
    const id = await s.commercial.saveManualLine(s.org, rid, version, {
      area_id: null,
      sort_order: 0,
      optional: false,
      name: 'Construction materials — selected specification',
      description: breakdown,
      quantity: p.areaSqft,
      unit: 'built-up sq ft',
      rate: p.ratePerSqft,
      reason:
        'Calculated from company construction material rates. Selections and rates recorded in description.',
      discount: { kind: 'none', value: '0' },
      estimated_cost_rate: null,
    });
    revalidatePath('/dashboard/quotations', 'layout');
    return {
      id,
      message:
        'Construction material selection added to the draft quotation. Review included components before issuing.',
    };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}
