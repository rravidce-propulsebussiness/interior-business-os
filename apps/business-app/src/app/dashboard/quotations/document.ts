import 'server-only';
import {
  customerDocumentSchema,
  renderQuotationDocument,
} from '@business-os/core/quotation-document';
import { lineSnapshotSchema } from '@business-os/quotation-engine';
import { DomainError, idSchema } from '@business-os/shared';
import { commercialServices } from '../commercial/service';
export async function quotationDocument(id: string) {
  const s = await commercialServices('quotation.view', 'quotation');
  idSchema.parse(id);
  const { data: r, error } = await s.client
    .from('quotation_revisions')
    .select('*')
    .eq('organization_id', s.org)
    .eq('id', id)
    .maybeSingle();
  if (error || !r) throw new DomainError('NOT_FOUND');
  const [{ data: q }, { data: lines, error: lineError }] = await Promise.all([
    s.client
      .from('quotations')
      .select('quotation_number')
      .eq('organization_id', s.org)
      .eq('id', r.quotation_id)
      .single(),
    s.client
      .from('quotation_items')
      .select('snapshot,description,area_snapshot,optional')
      .eq('organization_id', s.org)
      .eq('revision_id', id)
      .order('sort_order')
      .order('id'),
  ]);
  if (!q || lineError || !lines) throw new DomainError('NOT_FOUND');
  const areaOrder = (value: (typeof lines)[number]['area_snapshot']) =>
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof value.sort_order === 'number'
      ? value.sort_order
      : 0;
  lines.sort((a, b) => areaOrder(a.area_snapshot) - areaOrder(b.area_snapshot));
  const document = customerDocumentSchema.parse({
    number: q.quotation_number,
    revision: r.revision_number,
    status: r.status,
    currency: r.currency,
    valid_until: r.valid_until,
    header: r.document_snapshot,
    terms: r.terms,
    notes: r.customer_notes,
    totals: r.totals,
    lines: lines.map((line) => {
      const snapshot = lineSnapshotSchema.parse(line.snapshot),
        area = line.area_snapshot;
      return {
        name: snapshot.name,
        description: line.description,
        area:
          area &&
          typeof area === 'object' &&
          !Array.isArray(area) &&
          typeof area.name === 'string'
            ? area.name
            : '',
        optional: line.optional,
        quantity: snapshot.quantity,
        unit: snapshot.unit.label,
        rate: snapshot.display_rate,
        amount: snapshot.final_amount,
        discount: snapshot.discount_amount,
        specifications: snapshot.customer_specifications,
      };
    }),
  });
  return { document, html: renderQuotationDocument(document) };
}
