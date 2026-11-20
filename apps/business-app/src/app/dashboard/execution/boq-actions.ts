'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { SupabaseClient } from '@business-os/database';
import { executionServices } from './service';
import { normalizeStructuralSettings } from '@business-os/core/construction-boq';

const lineSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  section: z.string().trim().max(100).default('General'),
  kind: z.string().trim().min(1).max(50),
  unit: z.string().trim().min(1).max(30),
  inputs: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .default({}),
  outputs: z
    .array(
      z.object({
        name: z.string().max(160),
        quantity: z.number().finite().nonnegative(),
        unit: z.string().max(30),
        source: z.string().max(300).optional(),
        material: z.string().max(40).optional(),
        rate: z.number().finite().nonnegative().optional(),
        quotedRate: z.number().finite().nonnegative().optional(),
        rods: z.number().int().nonnegative().optional(),
        diameter: z.number().finite().nonnegative().optional(),
        weightKg: z.number().finite().nonnegative().optional(),
      }),
    )
    .max(100),
  quotedPrice: z.number().finite().nonnegative().optional(),
  quoteLineId: z.string().uuid().optional(),
  notes: z.string().max(2000).default(''),
  origin: z
    .enum([
      'quotation-structure',
      'quotation-allowance',
      'quotation-additional',
    ])
    .optional(),
});
const generatorSchema = z.object({
  revisionId: z.string().uuid(),
  generatedAt: z.string().max(40),
  settings: z.record(z.string(), z.number().finite()),
  counts: z.object({
    floors: z
      .record(
        z.string().max(90),
        z.record(z.string().max(40), z.number().int().nonnegative()),
      )
      .refine((floors) => Object.keys(floors).length <= 20),
    entranceGates: z.number().int().nonnegative(),
    compoundWallFeet: z.number().int().nonnegative(),
  }),
  floors: z
    .array(
      z.object({
        name: z.string().max(90),
        areaSqft: z.number().finite().nonnegative(),
        lengthFeet: z.number().finite().nonnegative(),
        widthFeet: z.number().finite().nonnegative(),
        heightFeet: z.number().finite().positive(),
        heightAssumed: z.boolean().optional(),
        parkingSqft: z.number().finite().nonnegative().optional(),
      }),
    )
    .max(20),
  /** Column / beam / footing schedule from the structural drawing. */
  design: z
    .object({
      columns: z.array(z.record(z.string(), z.unknown())).max(20),
      beams: z.array(z.record(z.string(), z.unknown())).max(20),
      plinthRunFeet: z.number().finite().nonnegative(),
      settings: z.record(z.string().max(40), z.number().finite()).optional(),
    })
    .nullable()
    .optional(),
  warnings: z.array(z.string().max(500)).max(50).default([]),
});
const saveSchema = z.object({
  id: z.string().uuid().optional(),
  version: z.number().int().positive().optional(),
  title: z.string().trim().min(1).max(200),
  projectId: z.string().uuid().nullable().optional(),
  quotationRevisionId: z.string().uuid().nullable().optional(),
  status: z.enum(['draft', 'final']).default('draft'),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .default('INR'),
  items: z.array(lineSchema).max(500),
  /** Chosen brand / source per material group, e.g. bricks → Karimnagar. */
  selections: z.record(z.string().max(40), z.string().max(80)).default({}),
  generator: generatorSchema.optional(),
});
const ratesSchema = z.object({
  items: z
    .array(
      z.object({
        key: z.string().trim().min(1).max(160),
        label: z.string().trim().min(1).max(160),
        unit: z.string().trim().min(1).max(30),
        rate: z.number().finite().nonnegative(),
        category: z.enum(['material', 'labour', 'other']),
        material: z.string().trim().max(40).optional(),
        variant: z.string().trim().max(80).optional(),
        isDefault: z.boolean().optional(),
      }),
    )
    .max(500),
  structural: z.record(z.string(), z.number().finite()).optional(),
  preferences: z
    .object({ lengthUnit: z.enum(['m', 'ft']).default('m') })
    .optional(),
});

type DbReply = { data?: unknown; error?: { message?: string } | null };

export async function saveManualBoq(input: unknown) {
  try {
    const value = saveSchema.parse(input);
    const s = await executionServices(
      value.id ? 'estimate.edit' : 'estimate.create',
    );
    const client = s.client as unknown as SupabaseClient;
    const document = {
      items: value.items,
      selections: value.selections,
      ...(value.generator ? { generator: value.generator } : {}),
    };
    let reply: DbReply;
    if (value.id) {
      const result = await client
        .from('construction_boq_documents')
        .update({
          title: value.title,
          project_id: value.projectId ?? null,
          quotation_revision_id: value.quotationRevisionId ?? null,
          status: value.status,
          currency: value.currency,
          document,
          version: (value.version ?? 1) + 1,
        })
        .eq('organization_id', s.org)
        .eq('id', value.id)
        .eq('version', value.version ?? 1)
        .select('id')
        .maybeSingle();
      reply = result;
      if (!result.error && !result.data)
        return {
          ok: false,
          message:
            'This BOQ changed in another session. Refresh and save again.',
        };
    } else {
      reply = await client
        .from('construction_boq_documents')
        .insert({
          organization_id: s.org,
          title: value.title,
          project_id: value.projectId ?? null,
          quotation_revision_id: value.quotationRevisionId ?? null,
          status: value.status,
          currency: value.currency,
          document,
        })
        .select('id')
        .single();
    }
    if (reply.error)
      throw new Error(
        (reply.error as { code?: string }).code === '23505'
          ? 'A BOQ generated from this quotation already exists. Open it from Saved BOQs.'
          : reply.error.message || 'Unable to save BOQ',
      );
    revalidatePath('/dashboard/execution/boq');
    revalidatePath('/dashboard/projects');
    return {
      ok: true,
      id: (reply.data as { id?: string } | null)?.id ?? value.id,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Unable to save BOQ.',
    };
  }
}

export async function removeManualBoq(id: string) {
  try {
    const s = await executionServices('estimate.edit');
    const client = s.client as unknown as SupabaseClient;
    const result = await client
      .from('construction_boq_documents')
      .delete()
      .eq('organization_id', s.org)
      .eq('id', id);
    if (result.error)
      throw new Error(result.error.message || 'Unable to remove BOQ');
    revalidatePath('/dashboard/execution/boq');
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Unable to remove BOQ.',
    };
  }
}

export async function saveBoqRates(input: unknown) {
  try {
    const value = ratesSchema.parse(input);
    const s = await executionServices('estimate.edit');
    await s.authorization.requirePermission(s.org, 'estimate.view_cost', {
      moduleKey: 'projects',
    });
    const actor = await s.authorization.requireAuthenticatedUser();
    const client = s.client as unknown as SupabaseClient;
    const previous = await client
      .from('construction_boq_rate_cards')
      .select('version,rates')
      .eq('organization_id', s.org)
      .maybeSingle();
    if (previous.error)
      throw new Error(previous.error.message || 'Unable to read rates');
    const version = Number(previous.data?.version ?? 0) + 1;
    // Saving prices alone keeps the company's saved structural settings.
    const savedRates = previous.data?.rates as
      | { structural?: unknown; preferences?: { lengthUnit?: 'm' | 'ft' } }
      | null
      | undefined;
    const savedStructural = savedRates?.structural;
    // Saving prices alone keeps the company's unit preference too.
    if (!value.preferences && savedRates?.preferences?.lengthUnit)
      value.preferences = { lengthUnit: savedRates.preferences.lengthUnit };
    if (value.structural || savedStructural)
      value.structural = normalizeStructuralSettings(
        value.structural ?? savedStructural,
      );
    const result = previous.data
      ? await client
          .from('construction_boq_rate_cards')
          .update({ rates: value, version, updated_by: actor.id })
          .eq('organization_id', s.org)
      : await client.from('construction_boq_rate_cards').insert({
          organization_id: s.org,
          rates: value,
          version,
          updated_by: actor.id,
        });
    if (result.error)
      throw new Error(result.error.message || 'Unable to save rates');
    revalidatePath('/dashboard/execution/boq');
    revalidatePath('/dashboard/execution/boq/pricing');
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Unable to save rates.',
    };
  }
}
