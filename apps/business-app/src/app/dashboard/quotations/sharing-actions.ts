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
 * One-click WhatsApp handoff. Uses the existing tenant-isolated, revocable
 * quotation sharing RPC and customer PDF endpoint, NOT an authenticated
 * dashboard PDF URL. Only an issued quotation can receive a public PDF link.
 * If the quote is ready, the click finalizes it via the existing guarded
 * commercial command. The browser then opens WhatsApp with a prefilled link;
 * sending still requires the user's confirmation in WhatsApp.
 */
export async function createWhatsAppPdfShare(revisionId: string): Promise<{
  ok: boolean;
  message: string;
  token?: string;
  recipientPhone?: string;
  clientName?: string;
  quoteNumber?: string;
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
      return { ok: false, message: 'This quotation version cannot be shared. Open the latest version.' };

    const header = documentHeaderSchema.safeParse(revision.document_snapshot);
    if (!header.success)
      return { ok: false, message: 'Quotation customer details are incomplete.' };

    const { data: quote, error: quoteError } = await s.client
      .from('quotations')
      .select('quotation_number,status')
      .eq('organization_id', s.org)
      .eq('id', revision.quotation_id)
      .maybeSingle();
    if (quoteError || !quote || quote.status === 'cancelled')
      return { ok: false, message: 'This quotation is not available to share.' };

    if (revision.status === 'draft') {
      // This deliberately respects the existing issue gate. No WhatsApp
      // message is prepared if the quotation is incomplete or unauthorized.
      if (!s.allowed('quotation.issue', 'quotation'))
        return { ok: false, message: 'You need quotation issuing permission before sharing.' };
      if (!hasSavedStagePaymentPlan(revision.terms))
        return { ok: false, message: 'Save the stage-wise payment schedule before sharing the PDF.' };

      const { data: item, error: itemError } = await s.client
        .from('quotation_items')
        .select('id')
        .eq('organization_id', s.org)
        .eq('revision_id', id)
        .limit(1);
      if (itemError || !item?.length)
        return { ok: false, message: 'Save at least one priced quotation item before sharing.' };

      // Uses the same issue action as the existing quotation Studio: validates
      // the signed revision, concurrency version and all issue prerequisites.
      await s.commercial.commit(s.org, {
        action: 'issue',
        revision_id: id,
        version: revision.version,
      });
    }

    const response = z.object({
      id: z.uuid(),
      token: z.string().regex(/^[0-9a-f]{64}$/),
    }).parse(crmResult(await s.client.rpc('quotation_share_manage', {
      p_organization_id: s.org,
      p_action: 'create',
      p_input: {
        revision_id: id,
        expires_at: null,
        pdf_enabled: true,
      },
    })));
    revalidatePath('/dashboard/quotations', 'layout');
    return {
      ok: true,
      message: 'Secure PDF link ready. Opening WhatsApp…',
      token: response.token,
      recipientPhone: header.data.customer.phone,
      clientName: header.data.customer.name,
      quoteNumber: quote.quotation_number,
    };
  } catch (error) {
    return { ok: false, message: safeFailure(error).message };
  }
}
