'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { activeOrganization, serverServices } from '@business-os/auth/server';
import { uploadProjectSiteMedia } from './actions';

type Result = { saved: boolean; message: string };
const uuid = z.uuid();

async function context(projectId: string) {
  const services = await serverServices();
  await services.authorization.requireAuthenticatedUser();
  const org = await activeOrganization();
  if (!org) throw new Error('Select an active company');
  uuid.parse(projectId);
  return { client: services.client, org: org.organizationId };
}
const refresh = (id: string) => {
  for (const route of ['', '/timeline', '/labour'])
    revalidatePath('/dashboard/projects/' + id + route);
};
const message = (error: unknown, fallback: string) =>
  error instanceof z.ZodError
    ? (error.issues[0]?.message ?? fallback)
    : error instanceof Error
      ? error.message
      : fallback;

/** Records one scheduled curing round (one canonical site_gate record), then
 * attaches the photo. The record is saved first because watchmen may upload
 * curing photos only after logging their round. */
export async function recordCuringRound(
  projectId: string,
  form: FormData,
): Promise<Result> {
  try {
    const planId = uuid.parse(form.get('plan_id'));
    const roundAt = z.iso
      .datetime({ offset: true })
      .parse(form.get('round_at'));
    const remarks = z
      .string()
      .trim()
      .min(3, 'Add a short remark, e.g. "Slab ponded, hessian wet"')
      .max(1000)
      .parse(form.get('remarks'));
    const file = form.get('file');
    if (
      file instanceof File &&
      file.size > 0 &&
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
    )
      throw new Error('Upload a JPEG, PNG or WebP photo');
    const { client, org } = await context(projectId);
    const recorded = await client.rpc(
      'project_curing_command' as never,
      {
        p_org: org,
        p_project: projectId,
        p_action: 'round_record',
        p_input: { plan_id: planId, round_at: roundAt, remarks },
      } as never,
    );
    if (recorded.error) throw new Error(recorded.error.message);
    const gateId = String((recorded.data as { id?: unknown } | null)?.id ?? '');
    if (file instanceof File && file.size > 0 && gateId) {
      const media = new FormData();
      media.set('file', file);
      media.set('category', 'curing');
      media.set('caption', 'Curing round ' + roundAt.slice(0, 16));
      const uploaded = await uploadProjectSiteMedia(projectId, media);
      if (!uploaded.saved || !uploaded.mediaId) {
        refresh(projectId);
        return {
          saved: true,
          message: 'Round recorded, but the photo failed: ' + uploaded.message,
        };
      }
      const attached = await client.rpc(
        'project_curing_command' as never,
        {
          p_org: org,
          p_project: projectId,
          p_action: 'round_photo',
          p_input: { gate_id: gateId, photo_id: uploaded.mediaId },
        } as never,
      );
      if (attached.error) {
        refresh(projectId);
        return {
          saved: true,
          message:
            'Round recorded, but the photo could not be attached: ' +
            attached.error.message,
        };
      }
    }
    refresh(projectId);
    return { saved: true, message: 'Curing round recorded.' };
  } catch (error) {
    return { saved: false, message: message(error, 'Unable to record curing') };
  }
}

/** Owner/manager approves a curing schedule taken from the project specification.
 * Every value is entered explicitly; there are no default durations. */
export async function createCuringPlan(
  projectId: string,
  form: FormData,
): Promise<Result> {
  try {
    const times = String(form.get('round_times') ?? '')
      .split(/[\s,]+/)
      .filter(Boolean);
    const input = z
      .object({
        stage_id: uuid,
        activity_index: z.coerce.number().int().min(0).max(1199).optional(),
        title: z.string().trim().min(3).max(160),
        spec_reference: z
          .string()
          .trim()
          .min(3, 'Cite the approved specification')
          .max(300),
        starts_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        ends_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        grace_minutes: z.coerce.number().int().min(10).max(720),
        round_times: z
          .array(
            z
              .string()
              .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM round times'),
          )
          .min(1)
          .max(12),
      })
      .parse({
        stage_id: form.get('stage_id'),
        activity_index: form.get('activity_index') || undefined,
        title: form.get('title'),
        spec_reference: form.get('spec_reference'),
        starts_on: form.get('starts_on'),
        ends_on: form.get('ends_on'),
        grace_minutes: form.get('grace_minutes'),
        round_times: times,
      });
    const { client, org } = await context(projectId);
    const { error } = await client.rpc(
      'project_curing_command' as never,
      {
        p_org: org,
        p_project: projectId,
        p_action: 'plan_create',
        p_input: { ...input, grace_minutes: String(input.grace_minutes) },
      } as never,
    );
    if (error) throw new Error(error.message);
    refresh(projectId);
    return {
      saved: true,
      message: 'Curing schedule approved. Rounds now appear for the site team.',
    };
  } catch (error) {
    return {
      saved: false,
      message: message(error, 'Unable to save curing schedule'),
    };
  }
}
