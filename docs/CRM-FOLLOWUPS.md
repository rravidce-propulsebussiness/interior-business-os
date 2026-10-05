# CRM follow-ups and reminders

Phase 10 uses the existing `lead_followups` and `lead_activities` tables. The `followup` action calls `crm_save` using the authorized canonical lead, recipient and configured title. It does not maintain a second reminder-task database. A quotation can resolve its originating lead through the converted project relationship; missing links fail visibly instead of inventing a lead.

Lead creation, stage changes and assignment changes are trusted transactional events. Follow-up due and inactive-lead rules are scheduled. Inactivity uses the source's updated timestamp consistently at dispatch and execution. A configured delayed `quotation.sent` action is rechecked before running: approved, declined or superseded quotations no longer qualify. Paid invoices, completed tasks and resolved snags no longer qualify for their overdue reminders.

Users continue completing follow-ups through the existing CRM workflow. My Work links there and the notification target resolves the current authorized entity. Internal activities use the canonical CRM/project activity services and share action idempotency with notifications. Manual tests create no activity or follow-up.

No rules are automatically enabled for a new organization. Create a paused rule, select a trusted event, preview it against an authorized source event, configure recipients and frequency limits, then enable it using `automation.execute`. Customer email additionally requires organization opt-in, a saved template, customer consent and a configured provider. An internal reminder is not consent to send a customer message.
