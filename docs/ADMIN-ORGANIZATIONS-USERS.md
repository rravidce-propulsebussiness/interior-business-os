# Organizations & Users — Super Admin

UI route: `/admin/organizations`.

The single company directory has been replaced by one user-centred directory:
Business Owners, Sellers, General Users, Active Users and Organizations,
with live counts, search, type/status/industry filters, sorting and paginated
responsive cards. No demo users, placeholder growth percentages, duplicate
CSS files or duplicate company provisioning routes are introduced.

## Canonical account model

- Supabase Auth identity: one user email/account (never create a duplicate).
- `public.profiles` holds name, optional avatar and active/suspended status.
- `public.organization_memberships` and `public.membership_roles` hold
  each user's *separate* company access.
- Company owners are automatically assigned the canonical owner role by
  existing `platform_company_create`. This has full *company* permissions
  subject to plan/module entitlements, **not** Super Admin access.
- A company may also be an approved marketplace seller (no duplicate account).
  Cards derive role kind from active memberships and marketplace seller status.
- Users with no company membership remain General Users.

## Actions

- **Create User** at `/admin/users/create` uses Supabase Auth's
  `signInWithOtp(..., shouldCreateUser: true)` from an authenticated
  Super Admin server action. The user receives a verification/magic-link
  email (email configuration and Supabase rate limits apply). No plaintext
  password, impersonation, tenant assignment, or owner role is created.
  The user must verify email before joining a company.
- **Create Organization** moves the *existing* create company form to
  `/admin/organizations/create`. The existing provisioner still creates
  owner membership/owner permissions, industries, subscription and optional
  marketplace seller, with the same validation rules.
- **View Details** at `/admin/users/[id]` shows one user's actual linked
  companies/roles and verified account status, with links to canonical
  `/admin/organizations/[id]` role, plan, industry and seller controls.
- **Manage** can attach a verified existing user to a company using a
  non-owner role and can activate/suspend ordinary accounts. A platform
  admin may not suspend themselves, a platform staff member, or an owner.
  All changes require platform permissions and emit audit entries.
- Authentication/onboarding is **not** evidence an email was delivered:
  Supabase may reject or rate-limit it; the action reports the result.
  Changing an owner requires the existing guarded owner-management flow.

## Security and deployment

Database migration `20261010000900_platform_users_directory.sql` is
required before deploying the new Business App. All user PII and
cross-company aggregated data are returned only by platform-permission
protected RPCs and never by public listing endpoints.

The new UI uses the existing Tailwind utilities and `DashboardShell`;
the old page content is replaced instead of duplicated. No new CSS file is
loaded. See `packages/database/tests/platform-users.sql` for guarded
directory/owner regression coverage.

**Do not assume staging is the live Supabase project.** Migrate only the
verified environment, deploy the Next app, then test with an actual
Super Admin, company owner, seller, employee and general user.
