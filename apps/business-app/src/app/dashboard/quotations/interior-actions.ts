'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { safeFailure } from '@business-os/shared';
import { commercialServices } from '../commercial/service';

const dimension = z
  .string()
  .regex(/^(?:[1-9]\d{0,3}|0)(?:\.\d{1,2})?$/)
  .refine((s) => Number(s) > 0);
const money = z
  .string()
  .regex(/^(?:[1-9]\d{0,5}|0)(?:\.\d{1,2})?$/)
  .refine((s) => Number(s) > 0);

const interiorLineSchema = z
  .object({
    revisionId: z.uuid(),
    version: z.number().int().positive(),
    room: z.string().trim().min(2).max(80),
    item: z.string().trim().min(2).max(150),
    length: dimension,
    width: dimension,
    rate: money,
    plywood: z.string().trim().max(120),
    finish: z.string().trim().max(120),
    hardware: z.string().trim().max(120),
    door: z.string().trim().max(120),
    remarks: z.string().trim().max(350),
  })
  .strict();

function decimalHundredths(raw: string): bigint {
  const [whole, fraction = ''] = raw.split('.');
  return BigInt(whole || '0') * 100n + BigInt((fraction + '00').slice(0, 2));
}

/** Canonical square-foot quantity, rounded to two places without floats. */
function interiorAreaSqft(length: string, width: string): string {
  const raw =
    (decimalHundredths(length) * decimalHundredths(width) + 50n) / 100n;
  return (
    (raw / 100n).toString() + '.' + (raw % 100n).toString().padStart(2, '0')
  );
}

export async function addInteriorStudioLine(raw: unknown): Promise<{
  ok: boolean;
  message: string;
}> {
  try {
    const data = interiorLineSchema.parse(raw);
    const s = await commercialServices('quotation.edit', 'quotation');
    const { data: revision, error } = await s.client
      .from('quotation_revisions')
      .select('id,status,version')
      .eq('organization_id', s.org)
      .eq('id', data.revisionId)
      .maybeSingle();
    if (
      error ||
      !revision ||
      revision.status !== 'draft' ||
      revision.version !== data.version
    ) {
      return {
        ok: false,
        message: 'This quotation was updated elsewhere. Refresh and try again.',
      };
    }

    const area = interiorAreaSqft(data.length, data.width);
    const description = [
      'Room: ' + data.room,
      'Dimensions: ' +
        data.length +
        ' ft × ' +
        data.width +
        ' ft = ' +
        area +
        ' sq ft',
      ...(data.plywood ? ['Plywood / core: ' + data.plywood] : []),
      ...(data.finish ? ['Finish / laminate: ' + data.finish] : []),
      ...(data.hardware ? ['Hardware: ' + data.hardware] : []),
      ...(data.door ? ['Door / shutter: ' + data.door] : []),
      ...(data.remarks ? ['Notes: ' + data.remarks] : []),
    ].join('\n');

    await s.commercial.saveManualLine(s.org, data.revisionId, data.version, {
      area_id: null,
      sort_order: 0,
      optional: false,
      name: data.room + ' — ' + data.item,
      description,
      quantity: area,
      unit: 'sq ft',
      rate: data.rate,
      reason: 'Company-authorized room-wise interior L × B item pricing.',
      discount: { kind: 'none', value: '0' },
      estimated_cost_rate: null,
    });

    revalidatePath('/dashboard/quotations/' + data.revisionId + '/studio');
    return { ok: true, message: 'Interior BOQ item saved to this quotation.' };
  } catch (error) {
    return { ok: false, message: safeFailure(error).message };
  }
}
