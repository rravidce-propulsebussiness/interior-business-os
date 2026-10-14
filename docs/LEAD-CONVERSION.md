# Lead conversion

Design recorded before implementation. Conversion locks the organization and lead, rechecks CRM, customer and project permissions/entitlements, and creates or selects one Customer and one compatible Project. Existing customer data is never overwritten. Potential normalized phone/email matches require explicit acknowledgement before creating a new customer.

The lead stores converted customer/project, actor and time. A repeated conversion returns the established mapping, including concurrent double clicks. Any failed constraint or authorization rolls the entire transaction back. Site visits are linked to the resulting project. Projects and Customers navigate to the original lead timeline rather than copying it.

Quotation creation continues through the existing Phase 3 attested command. Project-to-lead attribution supplies quotation timeline linkage without accepting arbitrary tenant identifiers. A project can have only one originating converted lead; multiple opportunities may still use the same customer with separate projects.

## Business OS sale and conversion boundaries (October 2026)

- ProPulse Marketplace sells **lead access**, not confirmed Customers. The ProPulse authenticated feed must include only `lead_purchases.status='paid'` for that ProPulse purchaser. Active membership claims, complimentary entitlements, and pending purchases are excluded; Business OS fails closed unless each lead has positive purchase and payment receipt IDs. One ProPulse purchaser may only link to one Business OS organization. Multiple independent buyers can receive separate tenant-scoped copies of the same purchased lead.
- Manual, website, sheet and other non-ProPulse CRM leads remain possible and are **not** labeled as purchased leads.
- An Open, Contacted, Quoted, or Closed–Lost lead remains **a lead only**. Its ProPulse sale or quotation issue does not make it a Customer.
- A company must move the lead to a configured pipeline stage with `outcome='won'`; the database requires `leads.lifecycle='won'` and `won_at IS NOT NULL` before its `crm_convert` RPC creates/links a Customer and Project. The mutation is permission-checked and transactional. Existing converted mappings stay idempotent.
- Conversion must review normalized phone/email matches and allow choosing an existing Customer rather than creating duplicates. No automatic merges or record deletion. Each organization's Customers and financial data remain private.
- The Clients directory is a post-sale list, not a second lead editor; new enquiries start from Leads. Service badges come from actual linked projects and are omitted when unknown. There is one Clients navigation entry, shared with the Client Account profile.

**Coordinated release:** Deploy ProPulse's paid-purchase feed and Business OS's receipt-validating sync as a pair. If the old ProPulse feed is still deployed, Business OS rejects non-attested rows instead of importing potentially unpaid leads. Apply the new database migrations to the correctly identified Business OS database only after validating backups and existing purchaser associations.
