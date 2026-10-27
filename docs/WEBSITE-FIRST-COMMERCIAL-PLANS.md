# Business OS hosted website plans: Growth, Scale and Direct Basic

## Product contract

Business OS hosts published customer websites. The customer purchases and owns
any custom domain at an external registrar. Business OS supplies optional
DNS/domain connection, verification and managed HTTPS **only where hosting
routes and certificates are configured and tested**. A platform-hosted subdomain
is available when the platform base domain is configured.

| Cohort | Included features | Excluded by default |
| --- | --- | --- |
| ProPulse Growth | One published-template website; website-only enquiry inbox; Business OS hosting; connect own domain | Project management, finance, full CRM, custom code |
| ProPulse Scale | Full Business OS modules; hosted website; domain connection | Domain registration/renewal |
| Direct Website Basic | Separately purchased template website; hosted enquiry inbox; domain connection | Full Business OS modules |

Direct Basic requires an authorized paid plan assignment. The current billing
page is read-only; **an automated self-service checkout and amount have not
been implemented**. Until a trusted checkout exists, activation is manual.
No price has been invented.

## Implemented on feature branch

- `20261027000100_website_first_plans.sql`: catalog tiers and capabilities
  (published-template requirement on Growth/Basic).
- `20261027000200_propulse_verified_membership.sql`: server-only verified
  membership synchronization. The ProPulse OAuth UserInfo integration is in
  the paired `propulse-business` PR; only the linked account may be
  synchronized. Membership-managed organizations use a plan with **zero
  permanent module entitlements** and receive time-limited grants. Scale
  upgrades, Growth downgrades and expiration never delete website data.
  Existing, separately purchased companies are not automatically overwritten.
- `20261027000300_website_only_enquiries.sql`: validated, tenant-scoped website
  enquiry capture with a separate inbox on Basic/Growth. Existing full-CRM
  sites continue writing canonical CRM leads; anti-spam, consent and
  published-domain verification are preserved.
- `20261027000400_website_first_onboarding.sql`: new direct registrations get
  no all-module trial. New ProPulse organizations receive no unrestricted
  promo and acquire only verified, expiring provider entitlements.
- Website create action and publish RPC enforce published template provenance
  for template-only subscriptions. Growth/Basic users cannot publish an
  arbitrary blank site by calling the lower-level create RPC.
- UI links to website enquiry inbox; Website Builder retains domain connection.
- Canonical DB verification adds Growth/Scale, direct registration and RLS
  assertions. Source compatibility with existing code is required.

## Critical launch gates

1. Deploy ProPulse provider changes first, after its own CI/security review.
   A short-lived OAuth provider token attests tier and expiry on UserInfo;
   no browser-supplied field can grant Scale.
2. Verify **actual** Business OS production Supabase project identity and
   migration history. Make a restorable backup before applying migrations.
3. Apply the four new migrations in order, regenerate DB types, run DB/security
   regression tests, and check existing businesses retained their assignments.
4. Confirm platform `base_domain`, managed TLS, custom-domain routing, and
   Websites app deployment. DNS and HTTPS must be verified independently.
5. Complete direct Website Basic subscription checkout and renewal/cancellation
   lifecycle, including price selection and payment confirmation. Admin-only
   activation is a temporary controlled path, not automated checkout.
6. Verify existing ProPulse-linked organizations' grandfathered promotions and
   carry out a careful transition. Untouched existing direct companies should
   retain legitimate purchases.
7. Test on disposable Growth, Scale, expired, cancelled and direct Basic
   accounts; ensure server-side denial of unauthorized project/CRM routes,
   website form submission, template-only publishing and tenant isolation.
8. Periodic or event-driven ProPulse membership refresh must handle
   mid-term cancellations while users are logged out. Expiry of the
   time-bound module grants works independently of login.
9. Resolve dependency security advisories and all CI failures before merging
   or deploying.

**This branch is an implementation candidate, not production activation.**
