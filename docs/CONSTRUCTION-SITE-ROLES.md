# Role-safe construction timeline: field engineer and watchman

This is an additive Phase 7 change on top of the construction delivery PR stack.

## Site engineer

The site engineer can now associate **their own** work reports, work-start/progress
photos and material requests with an existing floor or structural stage.

The association control lists only IDs returned by an organization- and
project-scoped, permission-checked database projection. Managers still see the
ordinary project-wide association options. The server checks record ownership
again before accepting any link, so passing a coworker's ID is denied.

A link does not complete a stage, sign off reinforcement, approve an invoice,
order materials or confirm client payment.

## Watchman

A watchman is intentionally denied the detailed construction blueprint and
commercial details. Instead of the misleading "stages not configured" message,
they see an authenticated curing-only dashboard with:

- curing round count, logged descriptions and dates;
- their own authorized curing photos;
- an action to log a curing round and upload photo evidence.

Site engineers cannot gain billing access by associating records. Watchmen
cannot view structural plans or payment schedules and cannot associate a
construction stage. Authorization is enforced in database RPCs, not just UI.

## Release conditions

The migration `20261015000400_construction_engineer_stage_options.sql`
replaces the read-only stage association RPC and requires all earlier site
and construction migrations through `20261015000300`. Apply in order only on
a confirmed staging/production project with verified backups.

**Do not merge/deploy directly to the live Hostinger site:** its Supabase
identity and migration state must first be confirmed. A connected Supabase
project labelled `interior-business-os` was inspected read-only on 2026-10-15
and lacked the Site Delivery and construction RPCs. It must not be assumed
to be the production database based on project name alone.

The PR's disposable Postgres tests include engineer self-linking,
coworker-record denial, exclusion of billing options, and watchman denial.
