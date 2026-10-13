import { notFound } from 'next/navigation';
import Link from 'next/link';
import { commercialServices } from '../../../commercial/service';
import { documentHeaderSchema } from '@business-os/core/quotation-document';
import { parseSftEstimate } from '@business-os/core/sft-quotation';
import { lineSnapshotSchema } from '@business-os/quotation-engine';
import { createConstructionRatesRepository } from '@business-os/database/construction-rates';
import { createConstructionPackagesRepository } from '@business-os/database/construction-packages';
import { QuotationStudioFrame } from '../../studio-frame';
import { QuotationStudioEditor } from '../../studio-editor';
import { ConstructionSelector } from '../../construction-selector';
import { InteriorRoomBuilder } from '../../interior-room-builder';
import { CommandForm } from '../../command-form';
import { SharingSection } from '../../sharing-section';
import { QuotationAttachments } from '../../quotation-attachments';

export const dynamic = 'force-dynamic';

export default async function QuotationStudio({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string; step?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const s = await commercialServices('quotation.view', 'quotation', true);
  const { data: revision, error: revisionError } = await s.client
    .from('quotation_revisions')
    .select('*')
    .eq('organization_id', s.org)
    .eq('id', id)
    .maybeSingle();
  if (revisionError || !revision) notFound();

  const [
    { data: root },
    { data: project },
    { data: items, error: itemsError },
    organization,
    user,
    allIndustries,
  ] = await Promise.all([
    s.client
      .from('quotations')
      .select('id,quotation_number,status')
      .eq('organization_id', s.org)
      .eq('id', revision.quotation_id)
      .maybeSingle(),
    s.client
      .from('projects')
      .select('id,industry_id,branch_id')
      .eq('organization_id', s.org)
      .eq('id', revision.project_id)
      .maybeSingle(),
    s.client
      .from('quotation_items')
      .select('id,snapshot,description,optional')
      .eq('organization_id', s.org)
      .eq('revision_id', revision.id)
      .order('sort_order')
      .order('id'),
    s.repository.organization(s.org),
    s.authorization.requireAuthenticatedUser(),
    s.repository.industries(),
  ]);
  if (!root || !project || !organization || itemsError || !items) notFound();

  const header = documentHeaderSchema.safeParse(revision.document_snapshot);
  if (!header.success) notFound();

  const industry = allIndustries.find((row) => row.id === project.industry_id);
  const industryKey = industry?.key ?? 'construction';
  const mode =
    query.mode === 'custom' || query.mode === 'pdf'
      ? query.mode
      : industryKey === 'construction'
        ? 'sft'
        : 'custom';
  const step =
    query.step === 'client' ||
    query.step === 'files' ||
    query.step === 'preview'
      ? query.step
      : 'quote';

  const editable =
    revision.status === 'draft' &&
    root.status !== 'cancelled' &&
    s.allowed('quotation.edit', 'quotation');
  const canIssue = s.allowed('quotation.issue', 'quotation');
  const canDiscount = s.allowed('quotation.discount', 'quotation');

  const saved = items.flatMap((item) => {
    const snap = lineSnapshotSchema.safeParse(item.snapshot);
    if (!snap.success) return [];
    const sft = parseSftEstimate(item.description);
    return [
      {
        id: item.id,
        name: snap.data.name,
        description: sft
          ? sft.totalAreaSqft +
            ' sq ft · ' +
            sft.rows.length +
            ' work areas · floor-wise SFT'
          : item.description,
        quantity: snap.data.quantity,
        unit: snap.data.unit.label,
        rate: snap.data.display_rate,
        amount: snap.data.final_amount,
        optional: item.optional,
      },
    ];
  });
  const existingSft =
    items.map((row) => parseSftEstimate(row.description)).find(Boolean) ?? null;
  const canPriceConstruction =
    editable &&
    s.allowed('quotation.override_rate', 'quotation') &&
    s.allowed('pricing.view', 'pricing') &&
    revision.currency === 'INR';

  const [rates, packages] = canPriceConstruction
    ? await Promise.all([
        createConstructionRatesRepository(s.client).list(s.org),
        createConstructionPackagesRepository(s.client).list(s.org),
      ])
    : [[], []];

  const command = { revision_id: revision.id, version: revision.version };
  const totals = revision.totals;
  const total =
    totals &&
    typeof totals === 'object' &&
    !Array.isArray(totals) &&
    typeof totals.final_amount === 'string'
      ? totals.final_amount
      : '0';

  return (
    <QuotationStudioFrame
      companyName={organization.name}
      accountEmail={user.email ?? ''}
    >
      <QuotationStudioEditor
        revisionId={revision.id}
        quoteNumber={root.quotation_number}
        revisionNumber={revision.revision_number}
        currency={revision.currency}
        status={revision.status}
        industryKey={industryKey}
        industryName={industry?.name ?? 'Project'}
        otherIndustries={allIndustries
          .filter(
            (row) =>
              row.status === 'active' &&
              !['construction', 'interior'].includes(row.key),
          )
          .map((row) => ({ key: row.key, name: row.name }))}
        header={header.data}
        lines={saved}
        total={total}
        initialMode={mode}
        initialStep={step}
        canEdit={editable}
        canIssue={canIssue}
        constructionEditor={
          canPriceConstruction ? (
            <ConstructionSelector
              key={mode}
              rates={rates}
              packages={packages}
              revisionId={revision.id}
              version={revision.version}
              initialSchedule={existingSft}
              initialMode={mode === 'custom' ? 'custom' : 'sft'}
            />
          ) : (
            <div className="qs-note">
              You need draft quotation editing and company construction pricing
              permissions to change SFT or package rates.
              <Link
                className="ml-2 font-semibold underline"
                href="/dashboard/pricing/construction"
              >
                Company rates
              </Link>
            </div>
          )
        }
        interiorEditor={
          editable ? (
            <InteriorRoomBuilder
              revisionId={revision.id}
              version={revision.version}
            />
          ) : (
            <p className="qs-note">This revision cannot be edited.</p>
          )
        }
        filesEditor={
          <QuotationAttachments revisionId={revision.id} editable={editable} />
        }
        termsEditor={
          editable ? (
            <CommandForm
              title="Save quotation specifications & terms"
              initial={{
                ...command,
                action: 'edit_revision',
                terms: revision.terms,
                customer_notes: revision.customer_notes,
                internal_notes: revision.internal_notes,
                valid_until: revision.valid_until,
                discount: revision.discount,
              }}
              fields={[
                {
                  key: 'valid_until',
                  label: 'Valid until (YYYY-MM-DD)',
                  required: true,
                },
                {
                  key: 'terms',
                  label:
                    'Materials, warranty, inclusions, exclusions, payment schedule and terms',
                  type: 'textarea',
                },
                {
                  key: 'customer_notes',
                  label: 'Customer notes, discounts or Price Guard details',
                  type: 'textarea',
                },
                {
                  key: 'internal_notes',
                  label: 'Internal notes (not in customer PDF)',
                  type: 'textarea',
                },
                ...(canDiscount
                  ? [
                      {
                        key: 'discount.kind',
                        label: 'Revision discount',
                        options: [
                          { value: 'none', label: 'None' },
                          { value: 'fixed', label: 'Fixed amount' },
                          { value: 'percentage', label: 'Percentage' },
                        ],
                      },
                      { key: 'discount.value', label: 'Discount value' },
                    ]
                  : []),
              ]}
            />
          ) : (
            <div className="qs-info-box">
              <strong>Customer terms</strong>
              <p className="whitespace-pre-wrap">
                {revision.terms || 'No additional terms.'}
              </p>
              <p className="whitespace-pre-wrap">{revision.customer_notes}</p>
            </div>
          )
        }
        sharingEditor={
          <SharingSection revisionId={revision.id} status={revision.status} />
        }
        issueEditor={
          <CommandForm
            title="Issue and freeze this quotation"
            initial={{ ...command, action: 'issue' }}
          />
        }
      />
    </QuotationStudioFrame>
  );
}
