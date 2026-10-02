'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { shareCommandSchema } from '@business-os/core/quotation-sharing';
import { safeFailure } from '@business-os/shared';
import { crmResult } from '@business-os/database/crm';
import { commercialServices } from '../commercial/service';
export async function manageShare(
  input: unknown,
): Promise<{ message: string; token?: string }> {
  try {
    const { action, ...value } = shareCommandSchema.parse(input),
      s = await commercialServices('quotation.share', 'quotation');
    const data = z
      .object({
        id: z.uuid(),
        token: z
          .string()
          .regex(/^[0-9a-f]{64}$/)
          .optional(),
      })
      .parse(
        crmResult(
          await s.client.rpc('quotation_share_manage', {
            p_organization_id: s.org,
            p_action: action,
            p_input: value,
          }),
        ),
      );
    revalidatePath('/dashboard', 'layout');
    return {
      message:
        action === 'revoke'
          ? 'Link revoked.'
          : 'Secure link created. Copy it now; it cannot be retrieved later.',
      ...(data.token ? { token: data.token } : {}),
    };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}
