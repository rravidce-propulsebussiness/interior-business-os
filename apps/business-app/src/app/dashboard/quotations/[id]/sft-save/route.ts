import { z } from 'zod';
import { idSchema } from '@business-os/shared';
import { sftEstimateInputSchema } from '@business-os/core/sft-quotation';
import { saveFloorwiseSftEstimate } from '../../construction-actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const payloadSchema = z.object({
  version: z.number().int().positive(),
  input: sftEstimateInputSchema,
}).strict();

const json = (data: unknown, status: number) => Response.json(data, {
  status,
  headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options':'nosniff' },
});

/** A normal authenticated request instead of relying on a cached Server
 * Action ID, which can become stale across Hostinger deployments. The
 * underlying action still enforces organization isolation and edit rights. */
export async function POST(request: Request, {
  params,
}: {
  params: Promise<{id:string}>;
}) {
  const ref = crypto.randomUUID().slice(0, 8);
  try {
    const suppliedOrigin = request.headers.get('origin');
    const host = [new URL(request.url).host, request.headers.get('host'),
      request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()]
      .filter(Boolean);
    if (suppliedOrigin) {
      const origin = new URL(suppliedOrigin);
      if (!['http:', 'https:'].includes(origin.protocol) || !host.includes(origin.host))
        return json({message:'Cross-site quotation save denied.',reference:ref},403);
    } else if (!['same-origin','none'].includes(
      request.headers.get('sec-fetch-site') ?? '',
    )) {
      return json({message:'Quotation save requires a same-origin request.',reference:ref},403);
    }
    const size = Number(request.headers.get('content-length') ?? '0');
    if (size > 100_000)
      return json({message:'Quotation exceeds the allowed save size.',reference:ref},413);
    const { id } = await params;
    idSchema.parse(id);
    const raw = await request.text();
    if (raw.length > 100_000)
      return json({message:'Quotation exceeds the allowed save size.',reference:ref},413);
    const data = payloadSchema.safeParse(JSON.parse(raw));
    if (!data.success) {
      const issue = data.error.issues[0];
      return json({message:'Please check quotation input: '+(issue?.path.join('.') || 'details'),
        reference:ref},422);
    }
    const result = await saveFloorwiseSftEstimate(id,data.data.version,data.data.input);
    if (!result.id) return json({
      message:result.message,
      reference:ref,
    },422);
    return json(result,200);
  } catch (error) {
    // Error details belong only in server logs. The reference identifies the
    // request without exposing customer information or database credentials.
    console.error('quotation.sft_save.failed',{
      reference:ref,
      type:error instanceof Error ? error.name : 'Unexpected',
    });
    return json({message:'Quotation could not be saved. Reference '+ref+'.',
      reference:ref},500);
  }
}
