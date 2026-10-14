import { renderPdf, appendQuotationAnnexures } from '@business-os/shared/pdf';
import {
  packageAttachmentContext,
  QUOTATION_PDF_BUCKET,
} from '../../../package-attachment-storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };
const escape = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const ctx = await packageAttachmentContext(id);
    const pkg = ctx.packageItem;
    const { data: company } = await ctx.admin
      .from('organizations')
      .select('name')
      .eq('id', ctx.orgId)
      .single();
    const theme = /^#[A-Fa-f0-9]{6}$/.test(pkg.themeColor)
      ? pkg.themeColor
      : '#155EEF';
    const total = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(Number(pkg.ratePerSqft) * 1000);
    const specs = pkg.specSections.filter((s) =>
      Boolean(
        s.description ||
        s.brand ||
        s.grade ||
        s.allowancePerSqft ||
        s.deliverables?.some((d) => d.included) ||
        s.fields?.some((field) => field.label.trim() && field.value.trim()),
      ),
    );
    const specHtml = specs
      .map(
        (section, index) =>
          '<article class="spec"><h3><span class="number">' +
          String(index + 1).padStart(2, '0') +
          '</span> · ' +
          escape(section.title) +
          '</h3>' +
          (section.brand
            ? '<p>Brand: <strong>' + escape(section.brand) + '</strong></p>'
            : '') +
          (section.grade ? '<p>Grade: ' + escape(section.grade) + '</p>' : '') +
          (section.allowancePerSqft
            ? '<p>Specified allowance: ₹' +
              escape(section.allowancePerSqft) +
              '/SFT</p>'
            : '') +
          (section.deliverables?.some((d) => d.included)
            ? '<div><strong>Included plans &amp; drawings</strong><ul>' +
              section.deliverables
                .filter((d) => d.included)
                .map((d) => '<li>' + escape(d.label) + '</li>')
                .join('') +
              '</ul></div>'
            : '') +
          (section.fields?.length
            ? section.fields
                .filter((f) => f.label.trim() && f.value.trim())
                .map(
                  (f) =>
                    '<p><strong>' +
                    escape(f.label) +
                    ':</strong> ' +
                    escape(f.value) +
                    '</p>',
                )
                .join('')
            : '') +
          (section.description
            ? '<p>' + escape(section.description) + '</p>'
            : '') +
          '</article>',
      )
      .join('');
    const html = [
      '<!doctype html><html lang="en"><head><meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width,initial-scale=1">',
      '<title>',
      escape(pkg.name),
      ' - sample package PDF</title><style>',
      '@page{size:A4;margin:16mm}*{box-sizing:border-box}',
      'body{font:13px/1.55 Arial,sans-serif;color:#192841;margin:0;background:#eef4fa}',
      'main{max-width:800px;margin:auto;background:white;padding:35px}',
      'button,a{color:',
      theme,
      '}.intro{border-top:6px solid ',
      theme,
      ';padding-top:16px}',
      'h1{font-size:28px;line-height:1.15;margin:6px 0 12px}',
      'h2{font-size:19px;color:',
      theme,
      '}h3{font-size:14px}',
      '.muted{color:#63728a}.chip{background:#f1f6ff;border-left:4px solid ',
      theme,
      ';padding:12px;margin:12px 0}',
      'table{width:100%;border-collapse:collapse;margin-top:18px}',
      'td,th{padding:13px;border-bottom:1px solid #dbe4ed;text-align:left}',
      'th{background:#eaf2ff}.right{text-align:right}',
      '.total{font-weight:bold;background:#eff4ff;font-size:17px}',
      '.spec-sheet{break-before:page;page-break-before:always}',
      '.spec{padding:12px;border-bottom:1px solid #e3eaf2;break-inside:avoid}',
      '.spec p{white-space:pre-wrap;margin:3px 0}.number{color:',
      theme,
      ';font-weight:bold}',
      '.actions{display:flex;gap:12px;margin-bottom:15px}',
      '.actions a{background:',
      theme,
      ';color:white;border-radius:8px;padding:10px;text-decoration:none}',
      '@media print{body{background:white}main{padding:0}.actions{display:none}}',
      '</style></head><body><main>',
      '<nav class="actions"><a href="?format=pdf">',
      'Download sample PDF + attached specifications</a></nav>',
      '<section class="intro"><p class="muted">',
      escape(company?.name ?? 'Your company'),
      '</p><h1>',
      escape(pkg.name),
      '</h1>',
      '<div class="chip"><strong>',
      escape(pkg.code),
      '</strong> · ',
      escape(pkg.description),
      '</div>',
      '<h2>01 / Price calculation example</h2>',
      '<p class="muted">Illustration only. Customer floor dimensions and final amounts ',
      'are calculated independently in the actual quotation.</p>',
      '<table><thead><tr><th>Description</th><th>Area</th>',
      '<th class="right">Rate/SFT</th><th class="right">Amount</th></tr></thead>',
      '<tbody><tr><td>Sample built-up area</td><td>1,000 SFT</td>',
      '<td class="right">₹',
      escape(pkg.ratePerSqft),
      '</td>',
      '<td class="right">',
      escape(total),
      '</td></tr>',
      '<tr class="total"><td colspan="3">Illustrative amount</td>',
      '<td class="right">',
      escape(total),
      '</td></tr></tbody></table></section>',
      '<section class="spec-sheet"><p class="number">02 / PACKAGE SPECIFICATIONS</p>',
      '<h2>Materials, brands &amp; inclusions</h2>',
      '<p class="muted">Company-defined inclusions; subject to approved customer quotation.</p>',
      specHtml || '<p class="muted">No manual specifications entered.</p>',
      '<p class="muted">Material allowances describe inclusions, not additional charges.</p>',
      '</section></main></body></html>',
    ].join('');
    if (new URL(request.url).searchParams.get('format') !== 'pdf') {
      return new Response(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'private, no-store',
          'Content-Security-Policy':
            "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'self'; base-uri 'none'",
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }
    // The HTML screen has an internal preview link; PDF preflight deliberately
    // disallows relative href values and any active content.
    const printable = html.replace(/<nav class="actions">[\s\S]*?<\/nav>/, '');
    const base = await renderPdf(printable);
    const { data: attachment, error } = await ctx.admin
      .from('construction_package_spec_attachments')
      .select('storage_path,byte_size')
      .eq('organization_id', ctx.orgId)
      .eq('package_id', ctx.packageId)
      .maybeSingle();
    if (error) throw Error('Source PDF unavailable');
    const pdfs: Uint8Array[] = [];
    if (attachment) {
      const { data: file, error: fileError } = await ctx.admin.storage
        .from(QUOTATION_PDF_BUCKET)
        .download(attachment.storage_path);
      if (fileError || !file || file.size !== attachment.byte_size)
        throw Error('Attached source PDF unavailable');
      pdfs.push(new Uint8Array(await file.arrayBuffer()));
    }
    const result = await appendQuotationAnnexures(base, pdfs);
    return new Response(new Uint8Array(result), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="Package-Preview.pdf"',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response('Package preview unavailable', { status: 403 });
  }
}
