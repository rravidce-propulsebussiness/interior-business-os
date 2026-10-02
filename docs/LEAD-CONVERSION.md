# Lead conversion

Design recorded before implementation. Conversion locks the organization and lead, rechecks CRM, customer and project permissions/entitlements, and creates or selects one Customer and one compatible Project. Existing customer data is never overwritten. Potential normalized phone/email matches require explicit acknowledgement before creating a new customer.

The lead stores converted customer/project, actor and time. A repeated conversion returns the established mapping, including concurrent double clicks. Any failed constraint or authorization rolls the entire transaction back. Site visits are linked to the resulting project. Projects and Customers navigate to the original lead timeline rather than copying it.

Quotation creation continues through the existing Phase 3 attested command. Project-to-lead attribution supplies quotation timeline linkage without accepting arbitrary tenant identifiers. A project can have only one originating converted lead; multiple opportunities may still use the same customer with separate projects.
