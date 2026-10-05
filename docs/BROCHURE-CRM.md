# Brochure enquiries and CRM

Brochure forms reuse the existing canonical CRM; there is no brochure-specific lead table. The published document selects compact fields. Name, normalized phone and explicit consent are required. Optional configured fields include email and enquiry information. Unknown fields and nonexistent form pages are rejected. The active published form, CRM entitlement and module status are checked again within the organization lock.

A submission creates or reuses a canonical lead using existing phone/email duplicate detection, canonical lead numbering and source infrastructure. A lead activity preserves brochure ID, version ID/sequence, page, CTA and consent. Public responses return generic acceptance without lead/customer IDs. Repeated valid enquiries attach activity to the same lead rather than creating another customer record.

Request size is bounded, a honeypot discards bot submissions, and the database caps submissions at 60 per brochure per minute. Revoking Brochure, disabling sharing/forms, unpublishing or suspending the brochure blocks new submissions. Existing CRM leads and activities remain intact. Public forms cannot read customer data, estimates, rates, margins or internal project notes.

The analytics screen reports bounded daily aggregate views, PDF downloads, CTA clicks and leads when the plan and permission allow it. It stores no visitor profile or unique-user identity. Attribution remains available in canonical CRM activity history independently of the optional analytics UI.
