'use server';

import { revalidatePath } from 'next/cache';
import {
  calculateSftEstimate,
  encodeSftEstimate,
  sftEstimateInputSchema,
} from '@business-os/core/sft-quotation';
import { z } from 'zod';
import { createConstructionRatesRepository } from '@business-os/database/construction-rates';
import { createConstructionPackagesRepository } from '@business-os/database/construction-packages';
import { DomainError, idSchema, safeFailure } from '@business-os/shared';
import { commercialServices } from '../commercial/service';
import { snapshotConstructionPackagePdf } from '../pricing/construction/package-pdf-snapshot';

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

const packageSelectionSchema = selectionSchema.extend({
  packageId: idSchema,
});

export async function previewFixedPackage(
  revisionId: string,
  input: unknown,
): Promise<{
  message: string;
  total?: string;
  ratePerSqft?: string;
  packageName?: string;
}> {
  try {
    const id = idSchema.parse(revisionId);
    const value = packageSelectionSchema.parse(input);
    const { s } = await editable(id, false);
    const packageQuote = await createConstructionPackagesRepository(
      s.client,
    ).preview(s.org, value.packageId, value.ids, value.areaSqft);
    return {
      message:
        'The package price is fixed; selected brand specifications do not add extra charges.',
      total: packageQuote.total,
      ratePerSqft: packageQuote.ratePerSqft,
      packageName: packageQuote.packageName,
    };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}

export async function saveFixedPackage(
  revisionId: string,
  version: number,
  input: unknown,
): Promise<{ message: string; id?: string }> {
  try {
    const rid = idSchema.parse(revisionId),
      value = packageSelectionSchema.parse(input);
    if (!Number.isInteger(version) || version < 1)
      throw new DomainError('VALIDATION_FAILED');
    const { s, revision } = await editable(rid, true);
    if (revision.version !== version) throw new DomainError('CONFLICT');
    const p = await createConstructionPackagesRepository(s.client).preview(
      s.org,
      value.packageId,
      value.ids,
      value.areaSqft,
    );
    const specs = p.options.map(
      (o) =>
        o.category +
        ': ' +
        o.name +
        (o.specification ? ' — ' + o.specification : ''),
    );
    const breakdown = [
      'Package: ' + p.packageName + ' (' + p.packageCode + ')',
      ...(p.description ? ['Scope: ' + p.description] : []),
      'Materials / brands:',
      ...specs,
    ].join('\n');
    if (breakdown.length > 3000) throw new DomainError('VALIDATION_FAILED');
    const id = await s.commercial.saveManualLine(s.org, rid, version, {
      area_id: null,
      sort_order: 0,
      optional: false,
      name: p.packageName + ' — Construction package',
      description: breakdown,
      quantity: p.areaSqft,
      unit: 'built-up sq ft',
      rate: p.ratePerSqft,
      reason:
        'Fixed construction package ' +
        p.packageCode +
        '; material choices are specifications, not extra charges.',
      discount: { kind: 'none', value: '0' },
      estimated_cost_rate: null,
    });
    revalidatePath('/dashboard/quotations', 'layout');
    return {
      id,
      message:
        'Fixed-price construction package added. Selected brands are specifications, not additional costs.',
    };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}

const oneMaterialSchema = z
  .object({
    materialId: idSchema,
    areaSqft: selectionSchema.shape.areaSqft,
  })
  .strict();

export async function saveCustomizedMaterial(
  revisionId: string,
  version: number,
  input: unknown,
): Promise<{ message: string; id?: string }> {
  try {
    const rid = idSchema.parse(revisionId),
      value = oneMaterialSchema.parse(input);
    if (!Number.isInteger(version) || version < 1)
      throw new DomainError('VALIDATION_FAILED');
    const { s, revision } = await editable(rid, true);
    if (revision.version !== version) throw new DomainError('CONFLICT');
    // Re-read current prices from PostgreSQL. Never trust a browser-submitted rate.
    const p = await createConstructionRatesRepository(s.client).preview(
      s.org,
      [value.materialId],
      value.areaSqft,
    );
    const item = p.options[0];
    if (!item || Number(p.ratePerSqft) <= 0)
      throw new DomainError('VALIDATION_FAILED');
    const id = await s.commercial.saveManualLine(s.org, rid, version, {
      area_id: null,
      sort_order: 0,
      optional: false,
      name: item.category + ' — ' + item.name,
      description:
        'Materials / brands:\n' +
        item.category +
        ': ' +
        item.name +
        (item.specification ? ' — ' + item.specification : ''),
      quantity: p.areaSqft,
      unit: 'built-up sq ft',
      rate: p.ratePerSqft,
      reason:
        'Company-authorized custom material rate for ' +
        item.category +
        ' (' +
        item.name +
        ').',
      discount: { kind: 'none', value: '0' },
      estimated_cost_rate: null,
    });
    revalidatePath('/dashboard/quotations', 'layout');
    return {
      id,
      message:
        item.name +
        ' added as an individually priced quotation line. Add further items to customize the quote.',
    };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}

/** Floor/work-wise area estimates, independently priced and persisted as
 * one versioned quotation line. Brands below are inclusions, not surcharge
 * lines. On re-save we replace that line rather than bill the floors twice. */
export async function saveFloorwiseSftEstimate(
  revisionId: string,
  version: number,
  input: unknown,
): Promise<{ message: string; id?: string; total?: string; version?: number }> {
  try {
    const rid = idSchema.parse(revisionId);
    const parsed = sftEstimateInputSchema.parse(input);
    if (!Number.isInteger(version) || version < 1)
      throw new DomainError('VALIDATION_FAILED');
    const { s, revision } = await editable(rid, true);
    if (revision.version !== version) throw new DomainError('CONFLICT');
    const saved = await createConstructionRatesRepository(s.client).list(s.org);
    const options = saved.filter(
      (r) => parsed.materialIds.includes(r.id) && r.status === 'active',
    );
    if (
      options.length !== parsed.materialIds.length ||
      new Set(options.map((r) => r.category)).size !== options.length
    )
      throw new DomainError('VALIDATION_FAILED');
    const allPackages = await createConstructionPackagesRepository(
      s.client,
    ).list(s.org);
    const activePackages = allPackages.filter((p) => p.status === 'active');
    if (activePackages.length && !parsed.packageId)
      throw new DomainError('VALIDATION_FAILED');
    const selectedPackage = activePackages.find(
      (p) => p.id === parsed.packageId,
    );
    if (parsed.packageId && !selectedPackage)
      throw new DomainError('VALIDATION_FAILED');

    const calculated = calculateSftEstimate(
      parsed,
      options.map((o) => ({
        category: o.category,
        name: o.name,
        specification: o.specification,
      })),
      selectedPackage
        ? {
            id: selectedPackage.id,
            name: selectedPackage.name,
            code: selectedPackage.code,
            description: selectedPackage.description,
            ratePerSqft: selectedPackage.ratePerSqft,
            themeColor: selectedPackage.themeColor,
          }
        : undefined,
    );
    const description = encodeSftEstimate(calculated);
    const { data: existing, error } = await s.client
      .from('quotation_items')
      .select('id')
      .eq('organization_id', s.org)
      .eq('revision_id', rid)
      .or(
        'description.like.SFT_ESTIMATE_V1:%,description.like.SFT_ESTIMATE_V2:%',
      )
      .limit(2);
    if (error || !existing || existing.length > 1)
      throw new DomainError('VALIDATION_FAILED');
    // If a package has an attached source PDF, snapshot it independently;
    // saving a price line must not require privileged storage when there are
    // no package attachments (the common case).
    const [sourcePdf, oldPdf] = await Promise.all([
      selectedPackage
        ? s.client.from('construction_package_spec_attachments')
            .select('id').eq('organization_id', s.org)
            .eq('package_id', selectedPackage.id).limit(1)
        : Promise.resolve({ data: [], error: null }),
      s.client.from('quotation_studio_attachments')
        .select('id').eq('organization_id', s.org)
        .eq('revision_id', rid).not('source_package_id', 'is', null).limit(1),
    ]);
    if (sourcePdf.error || oldPdf.error)
      throw new DomainError('VALIDATION_FAILED');

    const id = await s.commercial.saveManualLine(s.org, rid, version, {
      ...(existing[0] ? { id: existing[0].id } : {}),
      area_id: null,
      sort_order: 0,
      optional: false,
      name: selectedPackage
        ? selectedPackage.name + ' — floor-wise construction'
        : 'Construction — floor-wise SFT estimate',
      description,
      quantity: '1',
      unit: 'complete estimate',
      rate: calculated.total,
      reason:
        'Versioned floor and additional-work schedule, package scope and customer-edited specifications; brand choices are inclusions.',
      discount: { kind: 'none', value: '0' },
      estimated_cost_rate: null,
    });
    let attachmentWarning = false;
    if ((sourcePdf.data?.length ?? 0) > 0 || (oldPdf.data?.length ?? 0) > 0) {
      try {
        const user = await s.authorization.requireAuthenticatedUser();
        await snapshotConstructionPackagePdf(
          s.org, rid, selectedPackage?.id ?? null, user.id,
        );
      } catch {
        // The quotation line has already been saved. Never report a failed
        // save because an optional PDF attachment snapshot was unavailable.
        // The owner must resolve the attachment before sharing it.
        attachmentWarning = true;
        console.error('construction.quotation.package_snapshot_failed', {
          revisionId: rid, organizationId: s.org,
        });
      }
    }
    const { data: updatedRevision } = await s.client
      .from('quotation_revisions')
      .select('version')
      .eq('organization_id', s.org)
      .eq('id', rid)
      .maybeSingle();
    revalidatePath('/dashboard/quotations', 'layout');
    return {
      id,
      total: calculated.total,
      ...(updatedRevision?.version ? { version: updatedRevision.version } : {}),
      message: attachmentWarning
        ? 'Quotation saved. Package PDF attachment needs attention before sharing.'
        : existing.length
          ? 'Floor-wise estimate updated. Review your revision before issuing.'
          : 'Floor-wise estimate saved with the itemized area/rate schedule. Review your PDF before issuing.',
    };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}
