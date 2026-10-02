# Billing

Billing settings contain legal business details, registration identifier, document prefixes, payment instructions, terms, invoice notes and receipt footer. Payment methods and tax codes are organization configuration. Their later changes do not rewrite issued documents.

Invoice drafts support tax invoices and proformas. Lines may reference accepted quotation scope, a milestone, an approved change order or an authorized manual amount. Source values are resolved on the server; submitted rates cannot override referenced scope. Manual invoice lines require `invoice.manage`. Invoice creation, issue, viewing and management are independent grants.

Draft edits require the current version. Issue validates contract state, source caps and the aggregate gross tax-invoice amount against current contract value, allocates a document number and freezes header, lines and tax breakdown. Repeated issue returns the same document. A proforma has a separate numbering kind, does not contribute to invoiced value and cannot receive payment allocations. Proformas are explicitly labelled on printouts.

Issued invoice content cannot be edited. Void requires a reason and no active payment allocations; closed contracts cannot be altered. Paid, partially paid and overdue are calculated from the immutable total and unreversed allocations. Payment reversal restores invoice balance without changing the invoice.

The gross invoicing ceiling is deliberate: taxes added to an accepted value must still fit the agreed current contract amount. Configure inclusive treatment or agree a variation when required; this phase does not silently increase a contract for tax.

Authorized preview and PDF routes use the same escaped customer-only projection and existing Playwright Chromium renderer. Documents use private/no-store responses and no public finance token. Tax invoice, proforma, payment request, receipt and change-order output preserve issued snapshots. No service-role key is used by the application.

Credit/debit notes, refunds, write-offs, online gateways, e-invoicing and accounting exports are outside this phase.
