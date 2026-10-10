# Automation email delivery

No email provider or background email queue existed before Phase 10. The shared worker owns a single optional Resend HTTP transport, in-app notifications and all other automation actions. Configure a verified sender and server-only API key only in the worker environment. Ordinary Business/Public apps receive neither worker database credentials nor provider credentials. Unconfigured delivery is logged as failed with `provider_not_configured`, never as sent.

Each delivery has one durable identifier, immutable first-attempt text/recipient and provider idempotency key. A two-minute lease and compare-token acknowledgement prevent competing workers from acknowledging another attempt. Retries retain exactly the same body/key. The database stops ambiguous retries at 23 hours, before Resend's documented 24-hour idempotency window expires, and marks the result uncertain for investigation. See [Resend idempotency documentation](https://resend.com/docs/dashboard/emails/idempotency-keys) and [send-email API](https://resend.com/docs/api-reference/emails/send-email).

Rule state, acting-user permissions, source state, recipient membership, preferences and customer consent are checked before delivery. Customer messages require organization opt-in and explicit recorded consent for an active canonical customer contact. Template variables are allowlisted; text is rendered without executable template expressions or arbitrary HTML. Internal cost, supplier rates, notes and secret values are never template variables. Live source amount/contact changes after an uncertain attempt stop resending stale content.

Organization daily quotas and recipient cooldowns apply under organization locking. Network and transient provider failures retry at most three times; permanent errors remain visible. The worker logs counts and safe error classifications, not addresses or bodies. Private transient email bodies expire after one day; delivery metadata and business/audit history remain. No WhatsApp, marketing campaigns or customer portal is introduced.

Tests use a fake transport. Hosted provider delivery is not claimed unless explicitly recorded in the Phase 10 verification report.

## Employee invitations (Phase 2 incremental integration)

Invitations use `private.employee_invitations` (not an alternative company membership or account system).
The issuing owner or delegated admin chooses one or more existing organization roles,
and the database verifies that the inviter can delegate **every** requested
permission. The Owner role cannot be issued by this flow. An invitation
is identified by the recipient's canonical email address. **No bearer token
alone can accept it**: a logged-in user must have the exact email confirmed in
Supabase Auth and an active profile; the RPC rechecks the inviter's current
authority, company, branch and roles at acceptance. Accepting atomically creates
one canonical active `organization_memberships` row with the requested
`membership_roles` and appends an audit entry.

The checked invitation RPCs support creation, recipient-only list, organization
administration list, seven-day expiry, ten-minute cooldown on resend, revoke
and one-time acceptance. They are denied to anonymous callers. Invitations are
stored in an RLS-enabled, non-exposed `private` table. Sending an email never
grants membership. Repeated acceptance and cross-email acceptance fail closed.

The existing restricted background worker sends the invitation message through
the same Resend transport, SMTP verification and immutable idempotency mechanism.
Configure `BUSINESS_APP_ORIGIN=https://sghomesinterior.in` in the **worker
environment**, together with the existing `AUTOMATION_EMAIL_API_KEY` and
`AUTOMATION_EMAIL_FROM`. Worker-origin validation only accepts an HTTPS root
origin; a missing or malformed value marks delivery unconfigured, not sent.
Neither the Business App nor browser receives a provider credential or
Supabase service role key. The invitation status screen shows queued / sent /
failed delivery separately from membership acceptance. Auth signup confirmation
and password reset continue through the existing Supabase Auth flow.

**Hosted release gate:** verify the actual Supabase project reference used by
Hostinger, take and restore-test a database backup, apply checked migrations in
order and confirm the restricted worker role and sender. CI tests exercise the
fake database/worker boundary but do not prove that real invitation email was
delivered. Hosted approval enforcement remains OFF until authenticated acceptance
and rollback testing pass.
