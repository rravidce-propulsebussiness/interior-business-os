'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { SupabaseClient } from '@business-os/database';
import { executionServices } from './service';
import { normalizeStructuralSettings } from '@business-os/core/construction-boq';
import { LABOUR_WORKS } from './boq-labour';
import { structuralDesignSchema } from './boq-structural-design-schema';
import { BOQ_SCOPE_WORKS } from './boq-scope-coverage';

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
        order: z.string().max(200).optional(),
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
  rmcRatePerM3: z.number().finite().nonnegative().max(10000000).optional(),
  counts: z.object({
    floors: z
      .record(
        z.string().max(90),
        z.record(z.string().max(40), z.number().int().nonnegative()),
      )
      .refine((floors) => Object.keys(floors).length <= 20),
    entranceGates: z.number().int().nonnegative(),
    compoundWallFeet: z.number().int().nonnegative(),
    windowSizes: z.record(z.string().max(90), z.string().max(200)).optional(),
    doorSizes: z
      .record(
        z.string().max(90),
        z.record(z.string().max(40), z.string().max(200)),
      )
      .optional(),
    walls: z
      .record(
        z.string().max(90),
        z
          .array(
            z.object({
              id: z.string().max(80),
              name: z.string().max(80),
              location: z.enum(['external', 'internal']),
              count: z.number().int().min(1).max(200),
              lengthFeet: z.number().finite().positive().max(500),
              heightFeet: z.number().finite().positive().max(500),
              thicknessIn: z.number().finite().min(3).max(14),
            }),
          )
          .max(50),
      )
      .optional(),
    finishes: z
      .record(
        z.string().max(90),
        z.object({
          rooms: z
            .array(
              z.object({
                name: z.string().max(60),
                lengthFeet: z.number().finite().nonnegative(),
                widthFeet: z.number().finite().nonnegative(),
              }),
            )
            .max(40),
          bathroomLengthFeet: z.number().finite().nonnegative(),
          bathroomWidthFeet: z.number().finite().nonnegative(),
          kitchenPlatformFeet: z.number().finite().nonnegative(),
          bathroomSizes: z.string().max(300).optional(),
          railingFeet: z.number().finite().nonnegative().optional(),
          internalPlasterCoats: z.union([z.literal(1), z.literal(2)]).optional(),
          externalPlasterCoats: z.union([z.literal(1), z.literal(2)]).optional(),
          tileWastagePercent: z.number().finite().min(0).max(30).optional(),
          excludeRoomFlooring: z.boolean().optional(),
          staircaseGraniteSqft: z
            .number()
            .finite()
            .nonnegative()
            .max(100000)
            .optional(),
          kitchenMeasurements: z
            .array(
              z.object({
                id: z.string().max(80),
                name: z.string().max(80),
                platformFeet: z.number().finite().nonnegative().max(500),
                platformDepthFeet: z.number().finite().nonnegative().max(500),
                wallTileFeet: z.number().finite().nonnegative().max(500),
                wallTileHeightFeet: z.number().finite().nonnegative().max(500),
              }),
            )
            .max(30)
            .optional(),
        }),
      )
      .optional(),
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
        penthouseSqft: z.number().finite().nonnegative().optional(),
      }),
    )
    .max(20),
  overrides: z
    .record(
      z.string().max(300),
      z.object({
        quantity: z.number().finite().nonnegative().optional(),
        rate: z.number().finite().nonnegative().optional(),
      }),
    )
    .refine((value) => Object.keys(value).length <= 500)
    .optional(),
  /** Column / beam / footing schedule from the structural drawing. */
  design: structuralDesignSchema.nullable().optional(),
  measuredOnly: z.boolean().optional(),
  repeatFrom: z
    .record(z.string().max(90), z.string().max(90))
    .refine((value) => Object.keys(value).length <= 20)
    .optional(),
  warnings: z.array(z.string().max(500)).max(50).default([]),
});
const labourWorkSchema = z
  .string()
  .refine(
    (work) => LABOUR_WORKS.some((candidate) => candidate.id === work),
    'Unknown BOQ labour work',
  );
const nonnegative = z.number().finite().nonnegative();
const labourExtraSchema = z.object({
  id: z.string().min(1).max(90),
  name: z.string().trim().min(1).max(120),
  stage: z.string().min(1).max(100),
  work: labourWorkSchema,
  includedWorks: z.array(labourWorkSchema).max(25).optional(),
  method: z.enum(['itemwise', 'daily']),
  unit: z.string().min(1).max(20),
  quantity: nonnegative,
  quantitySource: z.enum(['manual', 'boq']),
  rate: nonnegative,
  workers: nonnegative,
  days: nonnegative,
  outsideScope: z.boolean(),
});
const labourSchema = z
  .object({
    version: z.literal(1),
    method: z.enum(['composite', 'itemwise', 'daily']),
    packageName: z.string().trim().min(1).max(100),
    rate: nonnegative,
    areaOverrideSqft: nonnegative.nullable(),
    coveredWorks: z.array(labourWorkSchema).max(25),
    itemRates: z.record(z.string(), nonnegative),
    dailyRates: z
      .array(
        z.object({
          id: z.string().min(1).max(90),
          name: z.string().trim().min(1).max(90),
          workers: nonnegative,
          days: nonnegative,
          rate: nonnegative,
        }),
      )
      .max(30),
    extras: z.array(labourExtraSchema).max(200),
  })
  .superRefine((value, context) => {
    if (value.method === 'composite' && value.coveredWorks.length === 0)
      context.addIssue({
        code: 'custom',
        path: ['coveredWorks'],
        message: 'Select covered works.',
      });
    if (new Set(value.coveredWorks).size !== value.coveredWorks.length)
      context.addIssue({
        code: 'custom',
        path: ['coveredWorks'],
        message: 'Duplicate covered works.',
      });
    const ids = new Set<string>();
    const autoCoverage = new Set<string>();
    for (const [index, extra] of value.extras.entries()) {
      if (ids.has(extra.id))
        context.addIssue({
          code: 'custom',
          path: ['extras', index],
          message: 'Duplicate labour item.',
        });
      ids.add(extra.id);
      const covered = [
        ...new Set([extra.work, ...(extra.includedWorks ?? [])]),
      ];
      if (
        value.method === 'composite' &&
        covered.some((work) => value.coveredWorks.includes(work)) &&
        !extra.outsideScope
      )
        context.addIssue({
          code: 'custom',
          path: ['extras', index],
          message:
            'Covered labour must be explicitly identified as outside the agreed scope.',
        });
      if (
        value.method === 'itemwise' &&
        extra.quantitySource === 'boq' &&
        !extra.outsideScope
      )
        context.addIssue({
          code: 'custom',
          path: ['extras', index],
          message:
            'Measured work is already charged by the item-wise default. Enter only a separately agreed extra quantity.',
        });
      if (extra.method === 'itemwise' && extra.quantitySource === 'boq') {
        for (const work of covered) {
          const key = [extra.stage, work].join('|');
          if (autoCoverage.has(key))
            context.addIssue({
              code: 'custom',
              path: ['extras', index],
              message:
                'Overlapping measured labour packages in the same stage.',
            });
          autoCoverage.add(key);
        }
      }
      if (
        extra.outsideScope &&
        extra.quantitySource === 'boq' &&
        extra.method === 'itemwise'
      )
        context.addIssue({
          code: 'custom',
          path: ['extras', index],
          message: 'Extra scope requires a separately entered quantity.',
        });
    }
  });
const projectCostsSchema = z.object({
  siteSetup: nonnegative.max(100000000),
  utilities: nonnegative.max(100000000),
  logistics: nonnegative.max(100000000),
  equipment: nonnegative.max(100000000),
  siteStaff: nonnegative.max(100000000),
  miscellaneous: nonnegative.max(100000000),
  contingencyPercent: nonnegative.max(100),
  taxes: nonnegative.max(100000000),
});
const saveSchema = z.object({
  id: z.string().uuid().optional(),
  version: z.number().int().positive().optional(),
  title: z.string().trim().min(1).max(200),
  projectId: z.string().uuid().nullable().optional(),
  quotationRevisionId: z.string().uuid().nullable().optional(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .default('INR'),
  items: z.array(lineSchema).max(500),
  labour: labourSchema.optional(),
  projectCosts: projectCostsSchema.optional(),
  scopeReviews: z
    .record(z.string().max(80), z.enum(['covered', 'excluded']))
    .refine((reviews) =>
      Object.keys(reviews).every((key) =>
        BOQ_SCOPE_WORKS.some((item) => item.code === key),
      ),
    )
    .optional(),
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
    const canChangeLabour = s.allowed('estimate.view_cost');
    if ((value.labour || value.projectCosts) && !canChangeLabour)
      return {
        ok: false,
        message: 'BOQ cost rates require cost-view permission.',
      };
    const client = s.client as unknown as SupabaseClient;
    const document = {
      items: value.items,
      selections: value.selections,
      ...(value.labour ? { labour: value.labour } : {}),
      ...(value.projectCosts ? { projectCosts: value.projectCosts } : {}),
      ...(value.scopeReviews ? { scopeReviews: value.scopeReviews } : {}),
      ...(value.generator ? { generator: value.generator } : {}),
    };
    let reply: DbReply;
    if (value.id) {
      // A saved BOQ's project and quotation remain fixed on edit.
      const original = await client
        .from('construction_boq_documents')
        .select('project_id,quotation_revision_id,document')
        .eq('organization_id', s.org)
        .eq('id', value.id)
        .maybeSingle();
      if (original.error || !original.data)
        return { ok: false, message: 'Saved BOQ could not be found.' };
      if (
        original.data.project_id !== (value.projectId ?? null) ||
        original.data.quotation_revision_id !==
          (value.quotationRevisionId ?? null)
      )
        return {
          ok: false,
          message:
            'The saved project and quotation cannot be changed. Edit the existing BOQ.',
        };
      // A measurement-only editor must not erase an existing costing setup.
      const oldContent = original.data.document as {
        labour?: unknown;
        projectCosts?: unknown;
      } | null;
      const updatedDocument = canChangeLabour
        ? document
        : {
            ...document,
            ...(oldContent?.labour ? { labour: oldContent.labour } : {}),
            ...(oldContent?.projectCosts
              ? { projectCosts: oldContent.projectCosts }
              : {}),
          };
      const result = await client
        .from('construction_boq_documents')
        .update({
          title: value.title,
          currency: value.currency,
          document: updatedDocument,
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
      // Create only for a real project and its effective Final quote:
      // newest saved, unless a different quotation was manually marked Final.
      if (!value.projectId || !value.quotationRevisionId)
        return {
          ok: false,
          message:
            'Select a project with a Final quotation before creating a BOQ.',
        };
      const projectResult = await client
        .from('projects')
        .select('id,customer_id')
        .eq('organization_id', s.org)
        .eq('id', value.projectId)
        .eq('is_sales_prospect', false)
        .eq('removed_from_workspace', false)
        .maybeSingle();
      const project = projectResult.data;
      if (projectResult.error || !project?.customer_id)
        return { ok: false, message: 'Choose a valid active project.' };
      const selected = await client.rpc(
        'boq_effective_project_quotes' as never,
        { p_org: s.org, p_project_ids: [value.projectId] } as never,
      );
      const effectiveByProject = selected.data as Record<string, string> | null;
      if (selected.error || !effectiveByProject?.[value.projectId])
        return {
          ok: false,
          message: 'Save a quotation for this project before creating a BOQ.',
        };
      const finalQuote = await client
        .from('quotations')
        .select('current_revision_id')
        .eq('organization_id', s.org)
        .eq('id', effectiveByProject[value.projectId])
        .eq('project_id', value.projectId)
        .maybeSingle();
      if (
        finalQuote.error ||
        !finalQuote.data ||
        finalQuote.data.current_revision_id !== value.quotationRevisionId
      )
        return {
          ok: false,
          message:
            'The selected Final quotation does not belong to this project. Refresh and retry.',
        };
      const existingBoq = await client
        .from('construction_boq_documents')
        .select('id')
        .eq('organization_id', s.org)
        .eq('project_id', value.projectId)
        .limit(1)
        .maybeSingle();
      if (existingBoq.error)
        return { ok: false, message: 'Could not check saved BOQs.' };
      if (existingBoq.data)
        return {
          ok: false,
          message:
            'This project already has a BOQ. Open it from Saved BOQs to edit.',
        };
      reply = await client
        .from('construction_boq_documents')
        .insert({
          organization_id: s.org,
          title: value.title,
          project_id: value.projectId ?? null,
          quotation_revision_id: value.quotationRevisionId ?? null,
          status: 'draft',
          currency: value.currency,
          document,
        })
        .select('id')
        .single();
    }
    if (reply.error)
      throw new Error(
        (reply.error as { code?: string }).code === '23505'
          ? 'This project already has a BOQ. Open it from Saved BOQs to edit.'
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
