# Website enquiries and canonical CRM

Forms are structured configuration with labelled text, phone, email, select, radio, checkbox, textarea, number, date, location, consent and hidden campaign fields. Each field maps to an approved CRM value or enquiry note. Name, phone and explicit consent are mandatory. Attach a configured form to a page with a lead_form component.

Enabling a form requires the Website forms capability and existing CRM entitlement with an active open pipeline stage. Configuration creates the existing canonical Website lead source idempotently. Without CRM, publish a site without enabled enquiries; contact links remain available. The interior starter disables its form if CRM cannot be connected.

POST /api/enquiry resolves the current host/page/form against the published version. It accepts only configured fields, validates types and lengths, checks consent, normalizes the phone through the existing CRM helper and deduplicates by phone/email. New enquiries create canonical leads; repeated enquiries append lead activity to the existing lead. Activity retains website, page, form and consent. Internal IDs are not returned to the visitor. The published confirmation message is escaped.

Honeypot submissions produce a generic acknowledgement without a lead. A transactional quota of 60 requests per website/minute limits valid submissions. Invalid input is rejected without creating a lead. Preview forms are disabled. Forms revocation and CRM revocation apply to already published sites. There is no separate website-lead table, customer-account access, email automation or marketing platform.
