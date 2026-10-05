import { expect, it } from 'vitest';
import { reportHtml } from './report-document';
import { reportFilterSchema, reportCsv } from './automation';
it('escapes report records, filters and identity without executing markup', () => {
  const html = reportHtml(
    {
      kind: '<script>alert(1)</script>',
      generated_at: '2026-10-03',
      filters: { status: '<img src=x>' },
      rows: [{ title: '<iframe src="https://example.test">', value: '100' }],
    },
    '<svg>',
  );
  expect(html).not.toContain('<script>');
  expect(html).not.toContain('<iframe');
  expect(html).toContain('&lt;svg&gt;');
  expect(html).toContain('&lt;img src=x&gt;');
});
it('requires increasing aging boundaries and protects formula-like CSV cells', () => {
  expect(
    reportFilterSchema.safeParse({
      from: '2026-10-01',
      to: '2026-10-03',
      agingBuckets: [60, 30],
    }).success,
  ).toBe(false);
  expect(
    reportFilterSchema.safeParse({
      from: '2026-10-01',
      to: '2026-10-03',
      agingBuckets: [30, 60, 90],
    }).success,
  ).toBe(true);
  expect(
    reportCsv(['name'], [{ name: '\t=HYPERLINK("https://example.test")' }]),
  ).toContain("'\t=HYPERLINK");
});
