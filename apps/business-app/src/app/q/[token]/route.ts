import { renderQuotationDocument } from '@business-os/core/quotation-document';
import {
  escapeHtml,
  publicHeaders,
  publicQuotation,
  unavailable,
} from '../service';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params,
      q = await publicQuotation(token),
      d = q.document;
    const status =
      d.status === 'superseded'
        ? 'Superseded — a newer quotation revision exists.'
        : q.expired
          ? 'Expired — ask the business for a new revision.'
          : q.response
            ? 'Response recorded: ' + q.response.action.replaceAll('_', ' ')
            : 'Awaiting your response';
    const controls = `<section class="customer-response" aria-label="Customer response"><h2>${escapeHtml(status)}</h2><p>Issued ${escapeHtml(q.issued_at.slice(0, 10))}</p>${q.pdf_enabled ? `<p><a href="/q/${token}/pdf">Download this revision as PDF</a></p>` : ''}${q.response ? `<p>${escapeHtml(q.response.name)} · ${escapeHtml(q.response.responded_at)}</p><p>${escapeHtml(q.response.comment)}</p>` : ''}${q.can_respond ? `<h2>Your response</h2><p>Optional items are read-only and excluded from the quoted payable amount. Request a revised quotation to include them.</p><form method="post" action="/q/${token}/respond"><label>Your name<input name="name" required maxlength="200" autocomplete="name"></label><label>Comment (required when requesting changes)<textarea name="comment" maxlength="3000" rows="4"></textarea></label><label class="ack"><input type="checkbox" name="acknowledged" value="true" required>I confirm that I have reviewed this quotation. If approving, I agree to the quoted scope, price and terms.</label><div class="responses"><button name="action" value="approved">Approve quotation</button><button name="action" value="changes_requested">Request changes</button><button name="action" value="declined">Decline</button></div></form>` : ''}</section>`;
    let html = renderQuotationDocument(d).replace(
      '</main>',
      controls + '</main>',
    );
    html = html.replace(
      '</style>',
      `.customer-response{margin-top:28px;border-top:2px solid #ddd;padding-top:18px}.customer-response label{display:block;margin:16px 0}.customer-response input:not([type=checkbox]),textarea{display:block;width:100%;font:inherit;padding:12px;border:1px solid #777;border-radius:5px}.ack{display:flex!important;gap:12px;align-items:start}.ack input{min-width:22px;min-height:22px}.responses{display:flex;gap:12px;flex-wrap:wrap}button,a{min-height:44px}button{padding:12px;border:1px solid #555;border-radius:5px;background:#f3f6f5;font:inherit;cursor:pointer}a{display:inline-block;padding:8px 0;color:#174e47}@media(max-width:600px){body{padding:8px;font-size:14px}main{padding:12px!important}.parties{grid-template-columns:1fr;gap:4px}.line{width:42%}th,td{padding:8px 3px;font-size:12px}.totals{width:100%}.responses{flex-direction:column}button{width:100%}}@media print{.customer-response{display:none}}</style>`,
    );
    return new Response(html, {
      headers: { ...publicHeaders, 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch {
    return unavailable();
  }
}
