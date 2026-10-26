'use server';

import { revalidatePath } from 'next/cache';
import { randomUUID } from 'node:crypto';
import { createOwnerProvisioningDatabase } from '@business-os/database/server';
import { z } from 'zod';
import { serverServices, activeOrganization } from '@business-os/auth/server';
import {
  createConstructionPackagesRepository,
  type ConstructionSpecSection,
} from '@business-os/database/construction-packages';
import { DomainError, idSchema, safeFailure } from '@business-os/shared';

export type PackageActionState = {
  message: string;
  saved?: boolean;
  packageId?: string;
  version?: number;
};

const section = z
  .object({
    title: z.string().trim().min(2).max(90),
    brand: z.string().trim().max(120),
    grade: z.string().trim().max(120),
    description: z.string().trim().max(600),
    allowancePerSqft: z.string().trim().max(40),
    unit: z.enum(['none','sqft','bathroom','door','piece','kg','tonne','bag','cubic_meter','running_ft','point','lumpsum','meter','bhk']).optional(),
    pricingTreatment: z.enum(['included','allowance','extra','excluded']).optional(),
    allowanceValue: z.string().trim().max(40).optional().refine(
      (value) => !value || /^\d{1,9}(?:\.\d{1,2})?$/.test(value),
      'Enter a valid non-negative item amount',
    ),
  })
  .strict();
const schema = z
  .object({
    id: idSchema.optional(),
    version: z.number().int().positive().optional(),
    name: z.string().trim().min(2).max(120),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z][A-Z0-9-]{1,19}$/),
    description: z.string().trim().max(600),
    ratePerSqft: z
      .string()
      .regex(/^(0|[1-9]\d{0,5})(\.\d{1,2})?$/)
      .refine((v) => Number(v) > 0),
    status: z.enum(['active', 'inactive']),
    themeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    specSections: z.array(section).max(18),
  })
  .strict();

export async function saveConstructionPackage(
  _state: PackageActionState,
  form: FormData,
): Promise<PackageActionState> {
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
    const rawSections: unknown = JSON.parse(
      String(form.get('specSections') ?? '[]'),
    );
    const value = schema.parse({
      ...(id ? { id, version: Number(form.get('version')) } : {}),
      name: String(form.get('name') ?? ''),
      code: String(form.get('code') ?? ''),
      description: String(form.get('description') ?? ''),
      ratePerSqft: String(form.get('ratePerSqft') ?? ''),
      status: form.get('status') === 'inactive' ? 'inactive' : 'active',
      themeColor: String(form.get('themeColor') ?? '#155EEF'),
      specSections: rawSections as ConstructionSpecSection[],
    });
    const packageId = await createConstructionPackagesRepository(client).save(
      org.organizationId,
      value,
    );
    revalidatePath('/dashboard/pricing/construction');
    revalidatePath('/dashboard/quotations', 'layout');
    return {
      saved: true,
      packageId,
      version: id ? (value.version ?? 0) + 1 : 1,
      message:
        'Package saved. You can now attach a specification PDF or preview the branded document.',
    };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}

export async function installConstructionBrochurePackages(): Promise<{ ok: boolean; message: string }> {
  try {
    const org = await activeOrganization();
    if (!org) throw new DomainError('FORBIDDEN');
    const { authorization, client } = await serverServices();
    await authorization.requirePermission(org.organizationId, 'pricing.manage', { moduleKey: 'pricing' });
    await authorization.requirePermission(org.organizationId, 'pricing.view', { moduleKey: 'pricing' });
    const rpc = client.rpc.bind(client) as unknown as (
      name: string, args: Record<string, unknown>
    ) => Promise<{ data: number | null; error: { message?: string } | null }>;
    const { data, error } = await rpc('construction_package_install_three_starters', { p_org: org.organizationId });
    if (error) throw new Error(error.message || 'Import unavailable. Apply the latest database migration.');
    revalidatePath('/dashboard/quotations/packages');
    revalidatePath('/dashboard/pricing/construction');
    revalidatePath('/dashboard/quotations', 'layout');
    return { ok: true, message: data
      ? String(data) + ' editable company construction template(s) added.'
      : 'Standard, Premium and Royal already exist. Your existing packages were not changed.' };
  } catch (error) { return { ok: false, message: safeFailure(error).message }; }
}

export async function duplicateConstructionPackage(id: string): Promise<{ ok: boolean; message: string }> {
  try {
    const parsed = idSchema.parse(id);
    const org = await activeOrganization();
    if (!org) throw new DomainError('FORBIDDEN');
    const { authorization, client } = await serverServices();
    await authorization.requirePermission(org.organizationId, 'pricing.manage', { moduleKey: 'pricing' });
    await authorization.requirePermission(org.organizationId, 'pricing.view', { moduleKey: 'pricing' });
    const item = (await createConstructionPackagesRepository(client).list(org.organizationId))
      .find((pkg) => pkg.id === parsed);
    if (!item) throw new DomainError('NOT_FOUND');
    const code = (item.code.slice(0, 13) + '-C' + randomUUID().slice(0, 4)).toUpperCase();
    await createConstructionPackagesRepository(client).save(org.organizationId, {
      name: (item.name.slice(0, 110) + ' (Copy)').slice(0, 120),
      code,
      description: item.description,
      ratePerSqft: item.ratePerSqft,
      status: 'inactive',
      themeColor: item.themeColor,
      specSections: item.specSections.map((section) => ({ ...section })),
    });
    revalidatePath('/dashboard/quotations/packages');
    revalidatePath('/dashboard/pricing/construction');
    return { ok: true, message: 'Package duplicated as inactive. Review it before activating. Source PDF files are not duplicated.' };
  } catch (error) { return { ok: false, message: safeFailure(error).message }; }
}

export async function deleteConstructionPackage(id: string, version: number): Promise<{ ok: boolean; message: string }> {
  try {
    const parsed = idSchema.parse(id);
    if (!Number.isInteger(version) || version <= 0) throw new DomainError('VALIDATION_FAILED');
    const org = await activeOrganization();
    if (!org) throw new DomainError('FORBIDDEN');
    const { authorization, client } = await serverServices();
    await authorization.requirePermission(org.organizationId, 'pricing.manage', { moduleKey: 'pricing' });
    await authorization.requirePermission(org.organizationId, 'pricing.view', { moduleKey: 'pricing' });
    const admin = createOwnerProvisioningDatabase();
    const { data: attachment } = await admin
      .from('construction_package_spec_attachments').select('storage_path')
      .eq('organization_id', org.organizationId).eq('package_id', parsed).maybeSingle();
    const rpc = client.rpc.bind(client) as unknown as (
      name: string, args: Record<string, unknown>
    ) => Promise<{ data: boolean | null; error: { message?: string } | null }>;
    const { error } = await rpc('construction_package_delete', {
      p_org: org.organizationId, p_package_id: parsed, p_version: version,
    });
    if (error) throw new Error(error.message || 'Unable to delete package');
    if (attachment?.storage_path) {
      // Source PDF has been detached from the deleted package. Existing
      // quotation annexure snapshots remain independent and untouched.
      await admin.storage.from('quotation-private-annexures').remove([attachment.storage_path]);
    }
    revalidatePath('/dashboard/quotations/packages');
    revalidatePath('/dashboard/pricing/construction');
    revalidatePath('/dashboard/quotations', 'layout');
    return { ok: true, message: 'Package deleted. Previously issued quotations and PDF snapshots remain unchanged.' };
  } catch (error) { return { ok: false, message: safeFailure(error).message }; }
}
