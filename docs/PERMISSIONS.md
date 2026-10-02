# Authorization model

## Phase 7 work in progress

Operations adds execution, milestone, task, inventory, material-issue, subcontract/work-order, inspection, snag, handover and execution-cost grants. Runtime authorization uses permissions, never role names. Template grants are configuration. Project assignments or explicit `execution.view_all` govern new project operations; `inventory.view_all` separately governs organization stock visibility. Site receipt-lot visibility grants no cost access. New operations require Projects; stock operations also require Purchasing and subcontract operations require Vendors. See PHASE7-VERIFICATION.md for tested boundaries and remaining acceptance.

## Phase 5 financial permissions

Billing entitlement gates every finance operation. Contract and change-order permissions additionally require Projects. Catalog-backed changes also require Catalog and Pricing entitlements and `catalog.view`. Handoff checks access to the accepted quotation response and project. Browser visibility is convenience only; server services, RPCs and RLS enforce authorization independently.

New grants are `contract.view/create/manage`, `payment_schedule.view/manage`, `payment_request.view/create/manage`, `invoice.view/create/issue/manage`, `payment.allocate/void`, `receipt.view`, `change_order.view/create/issue/manage/approve/manual` and `financial_report.view`. Existing `billing.manage`, `payment.view` and `payment.record` remain in use. All are organization-scoped; branch-only grants do not authorize organization-wide financial records.

Owner/Admin templates receive finance operations. Accountant receives contract viewing and schedule/request/invoice/payment/receipt/report operations, excluding contract creation/management and change orders. Project Manager receives contract, schedule and change-order viewing. Sales receives no finance grants. Runtime decisions inspect grants rather than role names. Custom roles may separate record, allocation, issue and approval duties.

Every financial table forces RLS, with SELECT policies gated by the relevant permission/entitlement. Application roles have no direct INSERT/UPDATE/DELETE privileges. Audits are restricted by entity-specific finance visibility as well as existing audit access. The contract timeline filters each event by its read permission. Public quotation responses expose no new financial data. Finance API/document routes are authenticated and private/no-store.

## Phase 4 sales permissions

CRM adds `lead.view/create/manage/assign/convert/win`, `crm.activity.create`, `crm.followup.manage`, `crm.site_visit.manage`, `crm.pipeline.manage` and `crm.source.manage`. CRM requires its entitlement and organization-wide grants; branch-only grants fail closed. Owner/Admin configure sources, pipelines and requirements; Sales manage enquiries, activities, tasks, visits and conversion. Manual Won additionally requires `lead.win` and an outcome note.

`quotation.share` manages links; `quotation.customer_response.view` reads customer responses. Both require Quotation entitlement, independently of Website. Conversion also checks existing Customer and Project permissions/entitlements. Public customers use a constrained bearer-token RPC, never business memberships. Anonymous roles cannot read tenant tables or manage links. Raw tokens and hashes never enter audit metadata.

Never use an admin boolean. Phase 1 seeds granular keys including organization.view/manage/audit, branch.view/manage, team.view/invite/manage/remove, role.view/manage, catalog.view/manage, pricing.view/manage, crm.view/create/manage, quotation.view/create/edit/delete/approve/discount/override_rate/view_internal_cost, project.view/create/manage, billing.view/create/manage, payment.view/record, vendor.view/manage, purchase.view/manage, brochure.view/manage, website.view/manage/publish, report.view/financial and settings.view/manage. Later module permissions establish vocabulary only; those business modules are not implemented. Phase 0 synthetic policy tests retain their original example keys to demonstrate that the pure policy is registry-neutral.

Organization-owned roles map to permission records. Membership role assignments are organization-wide or branch-scoped; their organization IDs must match through composite foreign keys. A user may combine multiple roles; matching explicit allow grants form a union. No implicit wildcard or role-name bypass. Lack of a grant denies access. An organization grant covers its branches; a branch grant never authorizes organization-wide operations.

Seeded role templates include Owner, Admin, Branch Manager, Sales, Interior Designer, Estimator, Accountant, Purchase Manager, Project Manager and Site Supervisor. Businesses may create custom roles. Templates are configurable seeds, not conditions in application code. Current mutations reject last-owner removal/suspension and permission escalation beyond caller authority, protect the Owner role definition and audit assignment changes. Full role-management UI remains deferred.

## Request enforcement

Phase 2 activates catalog.view/manage and pricing.view/manage. Catalog pages, actions and database reads require catalog.view plus the catalog entitlement. Catalog mutations also require catalog.manage. Pricing pages/previews require pricing.view plus pricing entitlement and catalog access; pricing mutations additionally require pricing.manage. Costs and cost audits require quotation.view_internal_cost. No user can infer cost via ordinary selling-rate rows or a pricing snapshot without that permission. Platform roles still grant no catalog access.

The catalog editor is organization-scoped. Branch-specific books can be configured and previewed by organization-authorized users; branch-only grants do not authorize organization-wide screens. Price book branch references and calculation contexts must belong to the active organization. Every server action checks that its submitted organization still matches the verified active organization, then database RPCs recheck current permissions/entitlements. The direct preview API follows the same service path. Audit access also requires the relevant module access to avoid leaking rates after entitlement revocation.

1. Verify identity server-side through Supabase Auth; do not trust client-provided session data.
2. Load active membership for the selected organization from the database.
3. Resolve current permissions and their branch scopes from trusted assignments.
4. Check resource organization and branch, required action and module entitlement.
5. Invoke a scoped repository under RLS; audit authorized mutations transactionally.

The auth package retains the pure `canAccess` policy and now adds createAuthorization with requireAuthenticatedUser, requireOrganizationMembership, requirePermission, requireEntitlement, requirePlatformPermission, requirePlatformRole and validateOrganizationSwitch. serverServices wires the service to Supabase Auth getUser and database RPCs. Database context includes only current active grants, preserving membership and assignment branch scope. A cookie never supplies trusted context. No cross-request permission cache exists. Callers choose required permission/module on the server, never from a client assertion.

Module definitions specify their required_permission. Navigation uses moduleNavigation with the same canAccess policy. The direct module page and API independently resolve membership, permission and entitlement. An inactive or unavailable module cannot be accessed by guessing its URL. Branch-scoped users only see links that their current organization-wide screen can authorize; branch-context module navigation will be introduced with actual module screens.

Current explicit denials override plan grants and other explicit grants. A window applies when valid_from <= now and valid_until is absent or > now. Future and expired rows do not apply. An active explicit grant supplements a plan; otherwise the active plan mapping decides. Inactive modules, suspended/archived organizations, suspended profiles and inactive memberships deny use. Permission and entitlement checks remain independent.

Platform permissions are platform.access, platform.organizations.view/manage, platform.entitlements.view/manage, platform.catalog.view, platform.roles.manage and platform.audit.view. Default roles are platform_super_admin, platform_admin and platform_support. Only the super-admin template receives platform.roles.manage. App routes check permissions, allowing future custom platform roles. The required bootstrap is an explicit operator SQL action, never automatic signup or user metadata.

Entitlements control licensed capability and limits, independent of RBAC. A paid module does not grant employee permission. A role does not activate a disabled module. Persist effective organization entitlements derived from subscriptions, trials, offers and authorized overrides. Check expiry and status before providing the current active set to the policy. Feature flags control rollout, never bypass authorization or entitlements. Website, brochure and client portal remain independent.

Platform staff use a separate role/permission namespace and assignment system. Tenant Owner is not Platform Admin. Platform permissions authorize control-plane operations only. Future support access requires a separate explicit tenant access workflow; all privileged access is attributable and audited. Public published website reads use a separate read-only projection policy.

Revocation must invalidate cached access promptly. Sensitive writes recheck current permissions in the transaction. Return safe 401/403 responses without exposing whether another tenant's record exists. UI hiding, middleware redirects and unpredictable UUIDs are not security boundaries.

## Phase 3 commercial permissions

New keys: customer.view, customer.create, customer.manage and quotation.issue. Existing quotation.create/edit/delete/discount/override_rate/view_internal_cost, project.view/create/manage and settings.manage remain granular. Cancellation uses quotation.delete but never deletes historical records. Owners/Admins receive the new keys; Sales/Branch Manager templates gain customer and commercial project access plus catalog.view, without discount, override, issue or cost permissions. These templates do not bypass database permission checks.

Customers require their permission plus either CRM or Quotation entitlement. Projects require Projects; quotations and documents require Quotation. Catalog-backed quotation pricing additionally requires Catalog and Pricing entitlements and catalog.view. Website, Brochure and Client Portal are never prerequisites. Cost rows require quotation.view_internal_cost; the customer DTO drops costs, minimum rates, internal notes and calculation details regardless of caller role. Branch-only grants do not authorize these initial organization-level screens.

## Phase 6 cost and procurement permissions

Projects gates estimates and materials. Purchasing additionally gates requisitions, RFQs, POs and receipts; vendor configuration and quote management also require Vendors. Execution does not require Billing. The optional commercial portion of the cost dashboard additionally requires contract.view and Billing.

Owner/Admin templates receive all execution grants. Estimator, Buyer, Project Manager and Accountant templates have independent action/cost grants. Site Supervisor and Interior Designer quantity access does not include estimate costs, material rates, vendor quotes or PO cost tables. Sales receives no procurement cost access. Site receipt recording does not grant price access. Branch-only grants do not authorize organization-wide execution actions.

Estimate/PO PDFs require their cost grants. RFQ recipient PDFs contain requested quantities only; receipt PDFs contain ordered/received/accepted/rejected quantities. No public execution route exists, and public quotation DTOs remain unchanged. SQL assertions explicitly exercise Site, Designer, Sales and foreign-tenant denials.

## Phase 8 Website module

See [Website architecture](WEBSITE-ARCHITECTURE.md), [builder](WEBSITE-BUILDER.md), [security and permissions](WEBSITE-SECURITY.md) and [verification](PHASE8-VERIFICATION.md). Website is optional, uses separate immutable public snapshots and canonical CRM enquiries, and does not introduce Phase 9.
