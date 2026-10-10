# Organization-first owner provisioning

The Super Admin creates **an organization and its owner together** at
`/admin/organizations/create`. The old `/admin/users/create` route redirects
there. There is no separate general-user creation flow in platform Admin.

An owner has the existing canonical full owner role, subject to company
subscription/entitlement restrictions. Marketplace seller status can be
enabled on the same organization. Only existing verified company owners and
seller owners appear in `/admin/organizations` and its detail pages; general
employees remain in their company workspace and are not removed from storage.

## Credentials

Configure **SUPABASE_SECRET_KEY** or **SUPABASE_SERVICE_ROLE_KEY** as a
_Business App server-only_ Hostinger environment secret. Never set
`NEXT_PUBLIC_*`, ship it into a build artifact, include it in logs, or place
it on public Websites app hosting.

After checking the logged-in platform administrator's permissions, the
server checks whether the owner email is already registered via the
`platform_owner_email_status` RPC.

- **New email:** use privileged Supabase Auth `admin.createUser` with the
  browser-generated strong temporary password and owner name; set
  `email_confirm: true` because Super Admin explicitly provisions this
  account. Create the company via the existing `platform_company_create`
  RPC, which grants the default owner role, industries, modules and optional
  seller status. The password is never stored by the Business App,
  included in RPC arguments, logged, or included in server action responses.
  The Super Admin can copy the password while still on the result screen.
- **Existing verified email:** reuse the account with its _current password_.
  Never override its password automatically.
- **Existing unverified/suspended email:** fail with an explanatory message;
  do not create a duplicate account.
- If a new owner account is created but company creation fails, the server
  makes a best-effort cleanup of _only that new account_, first ensuring it
  has no company membership. If cleanup cannot complete, admin should check
  user and company records before retrying.

The owner must change the temporary password promptly, using the existing
Forgot Password recovery flow. **First-login password rotation is not
technically enforced in this version**; do not describe it as forced.
Do not distribute temporary passwords over public chats or shared documents.

Super Admin can view owner company assignments and manage subscription,
industry and marketplace status. Member role cards are read-only on the
platform Company page; the actual company owner uses
`/dashboard/company/team` to invite and manage employees.

## Migration & verification

Before updating the frontend, apply
`20261011000000_platform_owner_directory.sql` to the **correct
interior-business-os production database** (not Tbot or ProPulse), and
configure the server-only secret. Check with a new owner account, existing
verified owner, and unauthorized admin; do not use or display real owner
passwords in test logs. Deployment is not automatically performed by
merging the repository.
