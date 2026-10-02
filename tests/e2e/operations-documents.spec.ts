import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { renderOperationsDocument } from '../../packages/core/src/operations-document';
import { renderQuotationPdf } from '../../apps/business-app/src/app/dashboard/quotations/pdf-renderer';
test('operational PDF projections are protected and render readable multi-page documents', async ({
  page,
  request,
}, info) => {
  test.skip(info.project.name !== 'business-app', 'Business app only');
  test.setTimeout(120000);
  const definitions = [
    ['material_issue', ['Material', 'Quantity', 'Unit', 'From', 'To']],
    [
      'consumption',
      [
        'Material',
        'Unit',
        'Estimated',
        'Purchased',
        'Received',
        'Issued',
        'Consumed',
        'Returned',
        'Scrap',
        'Variance',
      ],
    ],
    [
      'movement_report',
      [
        'Date',
        'Movement',
        'Material',
        'Location',
        'Quantity',
        'Unit',
        'Reason',
      ],
    ],
    ['inspection', ['Check', 'Result', 'Note']],
    [
      'snag',
      [
        'Area / Issue',
        'Priority',
        'Assigned',
        'Status',
        'Due',
        'Resolution',
        'Verification',
      ],
    ],
    ['handover', ['Handover item', 'Result', 'Note']],
  ] as const;
  await mkdir('test-results/phase7-pdf', { recursive: true });
  for (const [kind, columns] of definitions) {
    const response = await request.get(
      `/dashboard/operations/documents/${kind}/00000000-0000-4000-8000-000000000001/pdf`,
    );
    expect(response.status()).toBe(403);
    expect(response.headers()['cache-control']).toContain('no-store');
    const rows = Array.from(
      { length: kind === 'consumption' ? 45 : kind === 'snag' ? 35 : 12 },
      (_, i) =>
        columns.map((column, j) =>
          j === 0
            ? `${i + 1}. ${kind === 'handover' ? 'Care instructions and warranty documents' : kind === 'inspection' ? 'Surface finish and alignment verification' : 'Kitchen installation material / site activity'}`
            : [
                  'Quantity',
                  'Estimated',
                  'Purchased',
                  'Received',
                  'Issued',
                  'Consumed',
                  'Returned',
                  'Scrap',
                  'Variance',
                ].includes(column)
              ? '12.5'
              : column === 'Unit'
                ? 'sheet'
                : column === 'Date' || column === 'Due'
                  ? '2026-10-02'
                  : column === 'Result'
                    ? 'pass'
                    : column === 'Status'
                      ? 'closed'
                      : 'Reviewed and recorded by project supervisor.',
        ),
    );
    const html = renderOperationsDocument({
      schema_version: 1,
      kind,
      title: kind.replaceAll('_', ' ').toUpperCase(),
      number: 'OPS-2026-001',
      date: '2026-10-02',
      business: {
        name: 'Studio North Interiors',
        address: { line1: '14 Studio Road', city: 'Bengaluru' },
      },
      project: { name: 'Demo Residence' },
      customer: kind === 'handover' ? 'Ravi Kumar' : undefined,
      columns: [...columns],
      rows,
      notes:
        'Reviewed project records. Quantities and statuses are operational facts.',
      acknowledgement:
        kind === 'handover'
          ? 'Handover items received and recorded by authorized staff.'
          : undefined,
      prepared_by: 'Project Supervisor',
    });
    await page.setContent(html);
    await expect(
      page.getByRole('heading', { name: 'Studio North Interiors' }),
    ).toBeVisible();
    expect(await page.locator('body').innerText()).not.toMatch(
      /internal_notes|unit_cost|request_hash/,
    );
    const pdf = await renderQuotationPdf(html);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    await writeFile(`test-results/phase7-pdf/${kind}.pdf`, pdf);
  }
});
