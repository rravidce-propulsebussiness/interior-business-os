'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { safeFailure } from '@business-os/shared';
import { commercialServices } from '../commercial/service';

/** Copy the company's saved logo, address and contact details only to a
 * company-owned draft. PostgreSQL verifies tenancy, permission and version.
 * Issued customer PDFs and any customer-signed snapshot remain frozen.
 */
export async function refreshDraftQuotationBranding(
  revisionId: string,
  version: number,
): Promise<{ ok: boolean; message: string }> {
  try {
    const id = z.string().uuid().parse(revisionId);
    const expected = z.number().int().positive().parse(version);
    const s = await commercialServices('quotation.edit', 'quotation');
    const client = s.client as unknown as {
      rpc: (
        name: string,
        args: Record<string, string | number>,
      ) => Promise<{ data: number | null; error: { message: string } | null }>;
    };
    const { data, error } = await client.rpc(
      'quotation_refresh_draft_branding',
      {
        p_organization_id: s.org,
        p_revision_id: id,
        p_expected_version: expected,
      },
    );
    if (error || data == null) {
      return {
        ok: false,
        message:
          error?.message ||
          'Branding could not be updated. Save your company settings and try again.',
      };
    }
    revalidatePath('/dashboard/quotations/' + id + '/studio');
    revalidatePath('/dashboard/quotations/' + id + '/preview');
    revalidatePath('/dashboard/quotations/' + id + '/pdf');
    return {
      ok: true,
      message:
        'Draft branding refreshed. The saved logo, address and contact details now appear in this quotation.',
    };
  } catch (error) {
    return { ok: false, message: safeFailure(error).message };
  }
}
