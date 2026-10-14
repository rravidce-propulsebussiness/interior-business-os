'use server';

import { revalidatePath } from 'next/cache';
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
    kind: z.enum(['plans', 'material', 'custom']).optional(),
    deliverables: z
      .array(
        z
          .object({
            label: z.string().trim().min(2).max(90),
            included: z.boolean(),
          })
          .strict(),
      )
      .max(16)
      .optional(),
    fields: z
      .array(
        z
          .object({
            label: z.string().trim().min(2).max(80),
            value: z.string().trim().max(250),
          })
          .strict(),
      )
      .max(10)
      .optional(),
    title: z.string().trim().min(2).max(90),
    brand: z.string().trim().max(120),
    grade: z.string().trim().max(120),
    description: z.string().trim().max(600),
    allowancePerSqft: z.string().trim().max(40),
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
