import { notFound, redirect } from 'next/navigation';
import { idSchema } from '@business-os/shared';
import { commercialServices } from '../../commercial/service';

/** Legacy quotation detail URL now resolves to the single quotation Studio.
 * Both root quotation IDs and revision IDs are supported. No duplicate editor. */
export default async function QuotationDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  idSchema.parse(id);
  const s = await commercialServices('quotation.view', 'quotation', true);

  const { data: revision } = await s.client
    .from('quotation_revisions')
    .select('id')
    .eq('organization_id', s.org)
    .eq('id', id)
    .maybeSingle();
  if (revision) redirect('/dashboard/quotations/' + revision.id + '/studio?step=quote');

  const { data: quote } = await s.client
    .from('quotations')
    .select('current_revision_id')
    .eq('organization_id', s.org)
    .eq('id', id)
    .maybeSingle();
  if (quote?.current_revision_id)
    redirect('/dashboard/quotations/' + quote.current_revision_id + '/studio?step=quote');
  notFound();
}
