'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { shareCommandSchema } from '@business-os/core/quotation-sharing';
import { safeFailure, idSchema } from '@business-os/shared';
import { hasSavedStagePaymentPlan } from '@business-os/core/quotation-payment-plan';
import { documentHeaderSchema } from '@business-os/core/quotation-document';
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

/**
 * File-attachment handoff for Leads. This action ONLY enforces tenant sharing
 * permission and issues an approved draft using the existing commercial issue
 * gate. It never creates a public share token or WhatsApp text/link.
 * Once authorized, the browser fetches the authenticated saved-revision PDF
 * and shares it as a File via the Android share sheet.
 *
 * The user must confirm draft issuance before calling this action.
 */
export async function authorizeWhatsAppPdfAttachment(revisionId: string): Promise<{
  ok: boolean;
  message: string;
}> {
  try {
    const id = idSchema.parse(revisionId);
    const s = await commercialServices('quotation.share', 'quotation');
    const { data: revision, error: revisionError } = await s.client
      .from('quotation_revisions')
      .select('id,quotation_id,status,version,terms,document_snapshot')
      .eq('organization_id', s.org)
      .eq('id', id)
      .maybeSingle();
    if (revisionError || !revision)
      return { ok: false, message: 'Quotation not found.' };
    if (revision.status !== 'draft' && revision.status !== 'issued')
      return { ok: false, message: 'This revision cannot be shared. Open the latest quotation.' };
    const header = documentHeaderSchema.safeParse(revision.document_snapshot);
    if (!header.success)
      return { ok: false, message: 'Save complete customer and company details before sharing.' };
    const { data: quote, error: quoteError } = await s.client
      .from('quotations')
      .select('id,status')
      .eq('organization_id', s.org)
      .eq('id', revision.quotation_id)
      .maybeSingle();
    if (quoteError || !quote || quote.status === 'cancelled')
      return { ok: false, message: 'This quotation is not available to share.' };
    if (revision.status === 'draft') {
      if (!s.allowed('quotation.issue', 'quotation'))
        return { ok: false, message: 'Issuing permission is required before sharing a draft.' };
      if (!hasSavedStagePaymentPlan(revision.terms))
        return { ok: false, message: 'Save the stage-wise payment schedule before sharing.' };
      const { data: items, error: itemError } = await s.client
        .from('quotation_items')
        .select('id')
        .eq('organization_id', s.org)
        .eq('revision_id', id)
        .limit(1);
      if (itemError || !items?.length)
        return { ok: false, message: 'Save at least one priced quotation item first.' };
      await s.commercial.commit(s.org, {
        action: 'issue',
        revision_id: id,
        version: revision.version,
      });
    }
    revalidatePath('/dashboard/quotations', 'layout');
    revalidatePath('/dashboard/crm/leads');
    return { ok: true, message: 'Quotation approved. Preparing PDF attachment…' };
  } catch (error) {
    return { ok: false, message: safeFailure(error).message };
  }
}
