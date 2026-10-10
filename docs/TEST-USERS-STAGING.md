# Hosted Business OS test accounts — no local setup

Updated 2026-10-10. This project is deployed to **https://sghomesinterior.in** as
the Business App. Use the connected Supabase project for Auth and roles:
[`interior-business-os` Auth Users](https://supabase.com/dashboard/project/wqkjzuqiarjyoimrzalk/auth/users).

## Already provisioned in the hosted database

The active database contains 103 migrations, three development plans,
and a test-only tenant:

- Organization: **Business OS Test Workspace**
- Slug: `business-os-test-20261010`
- ID: `7872fdab-f513-4bd7-97f4-5c671f97bcbb`
- Plan: **Business** (all 12 predefined plan modules)
- Ten predefined tenant roles, with 637 role-permission assignments
- One Main Branch
- Existing registered account `rvrmvth@gmail.com`: active **Owner** membership.
  The Auth record's email is **not confirmed**; complete email verification
  before expecting a password login to work.

The hosted test organization contains no customer/commercial project records.
Do not delete or overwrite other organizations to test this one.

## Create additional hosted sign-in identities

Open [Supabase Dashboard → Authentication → Users](https://supabase.com/dashboard/project/wqkjzuqiarjyoimrzalk/auth/users).
Use **Add user** to create test identities you own and can access, with distinct
strong passwords. Prefer real controlled mailbox aliases over
`example.test` email addresses, which cannot receive confirmation emails.
Use your Supabase account's documented verification/admin creation flow.
Suggested accounts: Sales, Interior Designer, Accountant, and a separate
Platform Admin. You can add Project Manager/Site Supervisor later.

**Never share their passwords or a service-role/secret key in GitHub or chat.**

Creating Auth identities does _not_ grant tenant access. After identities
exist, use the authorized SQL role assignment process or ask the connected
Supabase administrator to attach the Sales, Designer, Accountant memberships
to `business-os-test-20261010`. Platform Admin must receive
`platform_super_admin` via a separately reviewed bootstrap assignment;
do not add it through public registration. Keep it separate from tenant roles.

## Test from the live domain

- Business App login: https://sghomesinterior.in/login
- Hosted registration: https://sghomesinterior.in/register
- Business dashboard: https://sghomesinterior.in/dashboard
- Supabase Auth users: https://supabase.com/dashboard/project/wqkjzuqiarjyoimrzalk/auth/users

First validate that the live Next.js app returns HTML and its configured
Supabase project matches `wqkjzuqiarjyoimrzalk`. Then test Owner,
Sales, Designer, and Accountant sessions separately, role-specific navigation,
module entitlements, and cross-tenant denial. The Platform Admin UI is a
_separate Next.js service_ (`BUSINESS_OS_SERVICE=platform-admin`) and cannot be
assumed to exist at the Business App's domain without an independent deployment.

The database provisioning above has been verified. Real password login,
email confirmation, rendered pages and production browser acceptance have
**not** been verified as of this update. Do not treat a correct SQL membership
as a passed login test.

An optional guarded **developer** script exists at
`packages/database/scripts/provision-test-auth-users.mjs`, but is **not
required for this hosted workflow**. It must never be run as a public endpoint
or on a production customer project.
