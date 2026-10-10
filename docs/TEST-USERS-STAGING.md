# Disposable Business OS Auth test accounts

This procedure is **only** for a confirmed disposable development or staging Supabase project.
It must not run on production or use a production secret key.

## Current test project (10 October 2026)

- Supabase ref: `wqkjzuqiarjyoimrzalk` (`interior-business-os`).
- Database migrations exist.
- The three development plans and default Starter provisioning record have been initialized.
- Auth contains an unrelated pre-existing unconfirmed account; leave it untouched.
- Tenant and platform role assignments do **not** exist yet.

## Create the five real Supabase Auth identities

The script uses the official server-only `supabase.auth.admin.createUser()`
operation, generates independent random passwords, confirms the disposable
`example.test` addresses and **never** gives them roles in Auth metadata.

From PowerShell on your trusted development computer, inside the repository:

```powershell
git pull origin main
corepack pnpm install --frozen-lockfile

$env:APP_ENV = "staging"
$env:SUPABASE_ENVIRONMENT = "staging"
$env:ALLOW_TEST_AUTH_PROVISIONING = "yes"
$env:BUSINESS_OS_TEST_PROJECT_REF = "wqkjzuqiarjyoimrzalk"
$env:SUPABASE_URL = "https://wqkjzuqiarjyoimrzalk.supabase.co"

# Obtain the SERVER secret key from Supabase Dashboard > Project Settings > API Keys.
# Never copy it into GitHub, ChatGPT, a public NEXT_PUBLIC_* variable, or this document.
$secret = Read-Host "Supabase server secret key" -AsSecureString
$env:SUPABASE_SECRET_KEY = [System.Net.NetworkCredential]::new("", $secret).Password

node packages/database/scripts/provision-test-auth-users.mjs
Remove-Item Env:SUPABASE_SECRET_KEY
```

Generated passwords and user IDs are stored in
`.tools/business-os-test-users.json` (locally ignored by Git).
Keep that file private, securely move credentials to your password manager,
and remove it after testing. If an account already exists, the script
leaves it alone rather than resetting an existing password.

Users created:

| Email | Intended role |
| --- | --- |
| `platform.admin@example.test` | Platform Super Admin |
| `owner@example.test` | Demo Interiors Owner |
| `sales@example.test` | Sales |
| `designer@example.test` | Interior Designer |
| `accountant@example.test` | Accountant |

## Assign organization and roles

Creating Auth accounts alone never grants application access.

In the **same disposable test project**, open Supabase SQL Editor and run the
existing `packages/database/supabase/seed-users.sql` file, in its entirety.
It requires all five Auth accounts to exist, and `seed.sql` to have populated
the plans (already done in the named project above). The seed will create
Demo Interiors, Main Branch, the Interior industry association, the
Professional plan, its ten role templates/permissions, four active tenant
memberships and one Platform Super Admin. Re-runs do not create duplicate
memberships or roles.

Do not paste generated Auth passwords into the SQL editor. Never apply
`seed-users.sql` to a production or customer-data database.

## Validate

1. Check Supabase Auth has the five disposable users, each with a confirmed email and profile.
2. Check `public.organizations` has `demo-interiors`, and there are four active tenant memberships.
3. Check `public.platform_user_roles` has the single disposable platform admin.
4. Sign in as Owner to **Business App**, and verify Demo Interiors/dashboard, modules and sign-out.
5. Sign in as Designer and Accountant separately and verify their permissions differ from Owner. Sales should have different access from Designer.
6. Sign in as Platform Admin to the independently hosted **Platform Admin** app and confirm no Business App tenant membership.
7. Validate foreign tenant ID access is denied, password reset, login/logout and role revocation before calling hosted acceptance passed.

If the Business App remains blank, troubleshoot Hostinger build and environment
configuration separately: working database records are not proof that hosted
Next.js is serving pages correctly.

## Cleanup

This procedure is intended for a disposable staging project. Prefer discarding
the test project at the end of acceptance rather than deleting arbitrary users
from a database containing real customers. If keeping it, first remove
memberships and other dependent data through controlled admin procedures;
never delete `auth.users` by raw SQL.
