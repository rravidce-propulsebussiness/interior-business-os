'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { safeFailure } from '@business-os/shared';
import { createQuotationPackagesRepository } from '@business-os/database/quotation-packages';
import { commercialServices } from '../commercial/service';

const applySchema = z
  .object({
    revisionId: z.uuid(),
    version: z.number().int().positive(),
    packageId: z.uuid(),
    quantity: z
      .string()
      .regex(/^(0|[1-9]\d{0,6})(\.\d{1,2})?$/)
      .refine((value) => Number(value) > 0 && Number(value) <= 1_000_000),
  })
  .strict();

export async function applyIndustryQuotationPackage(raw: unknown): Promise<{
  ok: boolean;
  message: string;
}> {
  try {
    const input = applySchema.parse(raw);
    const s = await commercialServices('quotation.edit', 'quotation');
    if (!s.allowed('pricing.view', 'pricing')) {
      return {
        ok: false,
        message: 'Company pricing access is required to apply a package.',
      };
    }

    const [{ data: revision, error: revisionError }, packages] =
      await Promise.all([
        s.client
          .from('quotation_revisions')
          .select('id,version,status,currency,project_id')
          .eq('organization_id', s.org)
          .eq('id', input.revisionId)
          .maybeSingle(),
        createQuotationPackagesRepository(s.client).list(s.org),
      ]);
    if (
      revisionError ||
      !revision ||
      revision.status !== 'draft' ||
      revision.version !== input.version
    ) {
      return {
        ok: false,
        message: 'The draft changed. Refresh and try again.',
      };
    }

    const [{ data: project, error: projectError }, industries] =
      await Promise.all([
        s.client
          .from('projects')
          .select('industry_id')
          .eq('organization_id', s.org)
          .eq('id', revision.project_id)
          .maybeSingle(),
        s.repository.industries(),
      ]);
    if (projectError || !project) {
      return { ok: false, message: 'The selected project is unavailable.' };
    }

    const industryKey = industries.find(
      (industry) => industry.id === project.industry_id,
    )?.key;
    const selected = packages.find((item) => item.id === input.packageId);
    if (
      !selected ||
      selected.status !== 'active' ||
      selected.industryKey !== industryKey ||
      selected.industryKey === 'construction' ||
      selected.currency !== revision.currency
    ) {
      return {
        ok: false,
        message:
          'This company package is unavailable for the project and currency.',
      };
    }

    const quantity = Number(input.quantity);
    if (
      (selected.pricingBasis === 'fixed' && quantity !== 1) ||
      (selected.pricingBasis === 'per_bhk' &&
        (!Number.isInteger(quantity) || quantity > 20)) ||
      (selected.pricingBasis === 'per_unit' &&
        (!Number.isInteger(quantity) || quantity > 1000))
    ) {
      return {
        ok: false,
        message:
          'Enter a valid quantity for the selected package pricing basis.',
      };
    }

    const unit =
      selected.pricingBasis === 'fixed'
        ? 'package'
        : selected.pricingBasis === 'per_sqft'
          ? 'sq ft'
          : selected.pricingBasis === 'per_bhk'
            ? 'BHK'
            : 'unit';

    await s.commercial.saveManualLine(s.org, input.revisionId, input.version, {
      area_id: null,
      sort_order: 0,
      optional: false,
      name: selected.name,
      description: [
        'Company package: ' + selected.name,
        'Package code: ' + selected.code,
        'Industry: ' + selected.industryKey,
        'Package version: ' + selected.version,
        'Price basis: ' + selected.pricingBasis,
        'Included specifications and exclusions:',
        selected.description || 'As agreed in the proposal.',
      ].join('\n'),
      quantity: selected.pricingBasis === 'fixed' ? '1' : input.quantity,
      unit,
      rate: selected.basePrice,
      reason:
        'Company-authorized quotation package ' +
        selected.code +
        ' at version ' +
        selected.version,
      discount: { kind: 'none', value: '0' },
      estimated_cost_rate: null,
    });
    revalidatePath('/dashboard/quotations/' + input.revisionId + '/studio');
    return {
      ok: true,
      message: 'Package added with its saved price and specifications.',
    };
  } catch (error) {
    return { ok: false, message: safeFailure(error).message };
  }
}
