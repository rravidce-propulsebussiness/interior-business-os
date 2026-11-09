import { z } from 'zod';
import { createOwnerProvisioningDatabase } from '@business-os/database/server';
import {
  privateHeaders,
  validSameOrigin,
  whatsappContext,
} from '@/lib/whatsapp-cloud';
import { DomainError, safeFailure } from '@business-os/shared';

export const dynamic = 'force-dynamic';

const saveSchema = z
  .object({
    shortcut: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9][a-z0-9_-]{0,29}$/),
    body: z.string().trim().min(1).max(1000),
  })
  .strict();
const deleteSchema = z.object({ id: z.string().uuid() }).strict();

function failureResponse(error: unknown) {
  const failure = safeFailure(error);
  return Response.json(failure, {
    status:
      error instanceof DomainError
        ? error.code === 'UNAUTHENTICATED'
          ? 401
          : error.code === 'VALIDATION_FAILED'
            ? 400
            : 403
        : 500,
    headers: privateHeaders,
  });
}

/** Saved replies staff insert in the composer by typing "/shortcut". */
export async function GET() {
  try {
    const { organizationId } = await whatsappContext('automation.view');
    const result = await createOwnerProvisioningDatabase()
      .from('whatsapp_quick_replies')
      .select('id,shortcut,body,updated_at')
      .eq('organization_id', organizationId)
      .order('shortcut')
      .limit(200);
    if (result.error) throw new Error('QUICK_REPLIES_READ_FAILED');
    return Response.json(
      { rows: result.data ?? [] },
      { headers: privateHeaders },
    );
  } catch (error) {
    return failureResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    if (!validSameOrigin(request))
      return Response.json(
        { message: 'Request origin was not accepted.' },
        { status: 403, headers: privateHeaders },
      );
    const input = saveSchema.safeParse(await request.json().catch(() => null));
    if (!input.success)
      return Response.json(
        {
          message:
            'Use a shortcut of letters, numbers, - or _ (max 30) and a reply up to 1000 characters.',
        },
        { status: 400, headers: privateHeaders },
      );
    const { organizationId } = await whatsappContext('automation.manage');
    const result = await createOwnerProvisioningDatabase()
      .from('whatsapp_quick_replies')
      .upsert(
        {
          organization_id: organizationId,
          shortcut: input.data.shortcut,
          body: input.data.body,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'organization_id,shortcut' },
      )
      .select('id')
      .single();
    if (result.error) throw new Error('QUICK_REPLY_SAVE_FAILED');
    return Response.json(
      { saved: true, id: result.data.id },
      { headers: privateHeaders },
    );
  } catch (error) {
    return failureResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    if (!validSameOrigin(request))
      return Response.json(
        { message: 'Request origin was not accepted.' },
        { status: 403, headers: privateHeaders },
      );
    const input = deleteSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!input.success)
      return Response.json(
        { message: 'Choose a quick reply.' },
        { status: 400, headers: privateHeaders },
      );
    const { organizationId } = await whatsappContext('automation.manage');
    const result = await createOwnerProvisioningDatabase()
      .from('whatsapp_quick_replies')
      .delete()
      .eq('organization_id', organizationId)
      .eq('id', input.data.id);
    if (result.error) throw new Error('QUICK_REPLY_DELETE_FAILED');
    return Response.json({ deleted: true }, { headers: privateHeaders });
  } catch (error) {
    return failureResponse(error);
  }
}
