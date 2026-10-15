# Construction Execution OS — Phase 12 authenticated client progress

**Status: isolated draft, not deployed.** This branch builds on draft
construction PR #109 and the entire construction stack. The existing
revocable bearer-link read-only progress route continues to work unchanged.

## Reuse and boundaries

- Canonical `public.customers` and `public.projects` remain the only client
  and project masters. No second CRM, customer or project records.
- Supabase Auth is the only identity provider. The client must register
  and verify the email before a manager can grant access; a customer does
  not become a company employee.
- Manager grant/revoke goes through a SECURITY DEFINER RPC with project
  membership/owner checks and a project lock. A manager must select an email
  matching the active customer's email or primary CRM contact. Existing
  registration/confirmation remains responsible for proving email ownership.
- `private.construction_client_project_access` is scoped by organization,
  project, customer and Auth user, with versioned revoke/regrant and
  append-only `construction_client_access_events` plus Site Delivery audit.
- Every client read checks `auth.uid()`, confirmed current Auth email,
  active profile, active project/customer, company project entitlement,
  active explicit access, and current CRM contact email match.
- Both private tables have forced RLS and no direct anonymous or
  authenticated grants; checked RPCs expose narrow allowlisted projections.
  No employee role or organization membership is granted.
- Client read RPCs expose only real construction stages and engineer reports
  with **latest manager approval plus explicit latest publication**.
  They never expose contracts, invoices, payments, internal estimates,
  staff contacts, prices, supplier margin, private security records or
  unpublished photos.
- `/client/projects` lists assigned projects; the child project page
  validates both organization and project again on every request.
  `/login?portal=client` uses the original login flow and returns the
  client to that separate route. No duplicate business sidebar.
- Manager access UI is in the existing Site Delivery workspace, with
  a fallback when the new RPC/migration is absent.

## Validation

`packages/database/tests/construction-client-access.sql` uses disposable
verified Auth identities and two independent client/project records.
It verifies project isolation, substituted organization/project IDs,
denial of manager/share rights, allowlisted projections, idempotent grants,
versioned revocation, and immediate access loss. The suite runs through
both the canonical DB verification and DB test entrypoints.

Do not alter existing customer emails as part of production migration;
the disposable test updates only rollback-protected demo fixtures.

Run `pnpm db:verify`, `pnpm db:types:check`, `pnpm check`, staging
role-based mobile tests and project-specific owner/client access acceptance.
Do not apply this additive migration to an unverified production database.

## Still missing for final user acceptance

This phase is **only authenticated progress**. It is not yet an authenticated
drawing approval, client change-order signing, agreement retrieval,
payments/invoice/receipt portal, private media gallery, client notifications,
or interactive design-revision workspace. Add those through separately
authorized, explicitly projected canonical records and audited commands.
Do not represent customer clicks as qualified electronic signatures.
