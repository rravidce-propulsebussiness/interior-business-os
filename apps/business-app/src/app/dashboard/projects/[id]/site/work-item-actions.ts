'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { activeOrganization, serverServices } from '@business-os/auth/server';
import { uploadProjectSiteMedia } from './actions';

type Result = { saved: boolean; message: string };
const uuid = z.uuid();
const target = z
  .object({
    projectId: uuid,
    stageId: uuid,
    index: z.number().int().min(0).max(1199),
  })
  .strict();
const measurement = z
  .object({
    label: z.string().trim().min(2).max(80),
    value: z
      .string()
      .trim()
      .regex(/^-?\d{1,7}(\.\d{1,3})?$/, 'Enter a number'),
    unit: z.enum([
      'mm',
      'cm',
      'm',
      'feet',
      'inch',
      'sqm',
      'sqft',
      'cum',
      'cft',
      'kg',
      'tonnes',
      'nos',
      'bags',
      'litres',
      'deg',
      'mpa',
      'percent',
      'hours',
    ]),
  })
  .strict();
const material = z
  .object({
    item: z.string().trim().max(200).default(''),
    quantity: z
      .string()
      .trim()
      .regex(/^\d{1,9}(\.\d{1,3})?$/, 'Enter a quantity'),
    unit: z.enum([
      'bags',
      'kg',
      'tonnes',
      'litres',
      'nos',
      'sqft',
      'sqm',
      'cft',
      'cum',
      'yards',
      'metres',
      'feet',
    ]),
    required_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose the required date'),
    boq_item_id: uuid.optional(),
    notes: z.string().max(3000).default(''),
  })
  .strict()
  .refine(
    (row) => row.boq_item_id || row.item.length >= 2,
    'Pick a BOQ item or name the material',
  );

async function context(projectId: string) {
  const services = await serverServices();
  await services.authorization.requireAuthenticatedUser();
  const org = await activeOrganization();
  if (!org) throw new Error('Select an active company');
  uuid.parse(projectId);
  return { client: services.client, org: org.organizationId };
}
function refresh(id: string) {
  for (const route of [
    '',
    '/timeline',
    '/procurement',
    '/checks',
    '/execution',
  ])
    revalidatePath('/dashboard/projects/' + id + route);
}
async function photoFrom(
  projectId: string,
  form: FormData,
  caption: string,
  category = 'site',
) {
  const file = form.get('file');
  if (!(file instanceof File) || file.size < 1) return null;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new Error('Upload a JPEG, PNG or WebP photo');
  const media = new FormData();
  media.set('file', file);
  media.set('category', category);
  media.set('caption', caption.slice(0, 200));
  const uploaded = await uploadProjectSiteMedia(projectId, media);
  if (!uploaded.saved || !uploaded.mediaId)
    throw new Error(uploaded.message || 'Photo upload failed');
  return uploaded.mediaId;
}

const actions = [
  'start',
  'pause',
  'resume',
  'measure',
  'complete',
  'reopen',
  'assign',
  'skip',
  'add_optional',
] as const;
type WorkAction = (typeof actions)[number];
const done: Record<WorkAction, string> = {
  start: 'Work started.',
  pause: 'Work paused.',
  resume: 'Work resumed.',
  measure: 'Measurements saved.',
  complete: 'Work completed with photo evidence.',
  reopen: 'Work item reopened.',
  assign: 'Assignment saved.',
  skip: 'Task marked not applicable. The reason is kept in the audit trail.',
  add_optional: 'Optional task added.',
};

/** One entry point for every work-item update. The database command enforces
 * roles, stage dependencies, hold points and skip rules. */
export async function updateWorkItem(
  input: { projectId: string; stageId: string; index: number; title: string },
  form: FormData,
): Promise<Result> {
  try {
    const parsed = target.parse({
      projectId: input.projectId,
      stageId: input.stageId,
      index: input.index,
    });
    const action = z.enum(actions).parse(form.get('action'));
    const note = String(form.get('note') ?? '').trim();
    if (note.length > 2000) throw new Error('Note is too long');
    const payload: Record<string, unknown> = {};
    if (
      ['start', 'pause', 'resume', 'measure', 'complete', 'reopen'].includes(
        action,
      ) &&
      note
    )
      payload.note = note;
    if (action === 'measure' || action === 'complete') {
      const raw = JSON.parse(
        String(form.get('measurements') ?? '[]'),
      ) as unknown;
      const rows = z
        .array(measurement)
        .max(20)
        .parse(
          Array.isArray(raw)
            ? raw.filter(
                (r) =>
                  r &&
                  typeof r === 'object' &&
                  String((r as { value?: unknown }).value ?? '').trim() !== '',
              )
            : [],
        );
      if (action === 'measure' && !rows.length)
        throw new Error('Enter at least one measurement');
      if (rows.length) payload.measurements = rows;
    }
    if (action === 'complete') {
      const chosen = String(form.get('photo_id') ?? '');
      const photo =
        (await photoFrom(parsed.projectId, form, input.title)) ??
        (chosen ? uuid.parse(chosen) : null);
      if (photo) payload.photo_id = photo;
    }
    if (action === 'assign') {
      const user = String(form.get('user_id') ?? '');
      payload.user_id = user ? uuid.parse(user) : null;
      payload.crew = String(form.get('crew') ?? '')
        .trim()
        .slice(0, 120);
    }
    if (action === 'skip') {
      payload.reason = String(form.get('reason') ?? '').trim();
      const change = String(form.get('change_order_id') ?? '').trim();
      if (change) payload.change_order_id = uuid.parse(change);
    }
    if (action === 'add_optional') {
      payload.title = String(form.get('title') ?? '').trim();
      payload.reason = String(form.get('reason') ?? '').trim();
    }
    const { client, org } = await context(parsed.projectId);
    const { error } = await client.rpc(
      'project_work_item_command' as never,
      {
        p_org: org,
        p_project: parsed.projectId,
        p_stage: parsed.stageId,
        p_index: parsed.index,
        p_action: action,
        p_input: payload,
      } as never,
    );
    if (error) throw new Error(error.message);
    refresh(parsed.projectId);
    return { saved: true, message: done[action] };
  } catch (error) {
    return {
      saved: false,
      message:
        error instanceof z.ZodError
          ? (error.issues[0]?.message ?? 'Check the form')
          : error instanceof Error
            ? error.message
            : 'Unable to update work item',
    };
  }
}

/** One Request Material action per work item: BOQ lines or manual items.
 * Requests go to the existing approval/procurement flow; nothing is ordered here. */
export async function requestWorkItemMaterials(
  input: { projectId: string; stageId: string; index: number },
  form: FormData,
): Promise<Result> {
  try {
    const parsed = target.parse(input);
    const raw = JSON.parse(String(form.get('items') ?? '[]')) as unknown;
    const items = z
      .array(material)
      .min(1)
      .max(12)
      .parse(raw)
      .map((row) =>
        Object.fromEntries(
          Object.entries(row).filter(([, v]) => v !== '' && v !== undefined),
        ),
      );
    const { client, org } = await context(parsed.projectId);
    const { error } = await client.rpc(
      'project_work_item_material_request' as never,
      {
        p_org: org,
        p_project: parsed.projectId,
        p_stage: parsed.stageId,
        p_index: parsed.index,
        p_items: items,
      } as never,
    );
    if (error) throw new Error(error.message);
    refresh(parsed.projectId);
    return {
      saved: true,
      message:
        items.length +
        ' material request' +
        (items.length === 1 ? '' : 's') +
        ' sent for approval.',
    };
  } catch (error) {
    return {
      saved: false,
      message:
        error instanceof z.ZodError
          ? (error.issues[0]?.message ?? 'Check the materials')
          : error instanceof Error
            ? error.message
            : 'Unable to request materials',
    };
  }
}

/** Owner/manager records a homeowner decision on one drawing with evidence. */
export async function recordDesignClientDecision(
  projectId: string,
  form: FormData,
): Promise<Result> {
  try {
    const design = uuid.parse(form.get('design_id'));
    const decision = z
      .enum(['approved', 'changes_requested'])
      .parse(form.get('decision'));
    const evidence = z
      .string()
      .trim()
      .min(10, 'Describe how the homeowner decided (10+ characters)')
      .max(2000)
      .parse(form.get('evidence'));
    const { client, org } = await context(projectId);
    const { error } = await client.rpc(
      'project_design_client_decision' as never,
      {
        p_org: org,
        p_project: projectId,
        p_design: design,
        p_decision: decision,
        p_evidence: evidence,
      } as never,
    );
    if (error) throw new Error(error.message);
    refresh(projectId);
    revalidatePath('/client');
    return {
      saved: true,
      message:
        decision === 'approved'
          ? 'Homeowner approval recorded.'
          : 'Requested changes recorded.',
    };
  } catch (error) {
    return {
      saved: false,
      message:
        error instanceof z.ZodError
          ? (error.issues[0]?.message ?? 'Check the form')
          : error instanceof Error
            ? error.message
            : 'Unable to record decision',
    };
  }
}

/** Project policy: hold design until Finance verifies the advance. */
export async function setAdvanceBeforeDesign(
  projectId: string,
  beforeDesign: boolean,
): Promise<Result> {
  try {
    const { client, org } = await context(projectId);
    const { error } = await client.rpc(
      'project_advance_policy_set' as never,
      {
        p_org: org,
        p_project: projectId,
        p_before_design: beforeDesign,
      } as never,
    );
    if (error) throw new Error(error.message);
    refresh(projectId);
    return {
      saved: true,
      message: beforeDesign
        ? 'Design will wait for the verified advance.'
        : 'Design may start once the agreement is signed.',
    };
  } catch (error) {
    return {
      saved: false,
      message:
        error instanceof Error ? error.message : 'Unable to change policy',
    };
  }
}
