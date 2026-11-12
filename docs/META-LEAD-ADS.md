# Meta Lead Ads (Facebook & Instagram lead forms) → CRM → WhatsApp

Status: implemented and verified locally (database tests, unit tests, type
check). **Not yet exercised against a live Meta app or the hosted database.**

Leads from Facebook/Instagram lead forms go directly into the Business OS CRM
through the Meta Graph API, the same way ProPulse does it. Nothing polls: Meta
pushes each new lead the moment it is submitted.

```
Lead form submitted ─► Meta webhook (leadgen) ─► Business OS fetches the lead
   ─► CRM lead created (source "Meta Lead Ads", first open pipeline stage)
   ─► WhatsApp template: "we received these details … reply YES to confirm"
   ─► lead replies YES ─► quotation message with the company's packages
```

Every step is written to the lead's timeline in the CRM.

## What the company owner does

Leads → **More** → **Facebook & Instagram lead forms**.

1. **Connect Facebook** and share the Pages that run lead ads.
2. Choose the Page → **Show lead forms** → **Connect this form**. New leads
   now arrive in All Leads automatically. **Import last 30 days** brings in
   older leads (it never sends WhatsApp messages).
3. Optional **WhatsApp follow-up** per form:
   - tick _Message each new lead…_, choose the WhatsApp number and an approved
     template. A ready-made template (`lead_details_confirmation`) can be sent
     to Meta for approval from the same screen.
   - tick _When they reply YES, share the quotation message_ and edit the text.

Template variables are filled in a fixed order: `{{1}}` lead name, `{{2}}` the
details they submitted, `{{3}}` company name. Templates with more than three
variables, or with a media/variable header, are not offered.

Quotation message placeholders: `{{name}}`, `{{company}}` and `{{packages}}`.
`{{packages}}` lists the company's active packages (Quotations → Packages) with
the rate per sq ft, plus an estimated total when the form asked for the area in
square feet. It is an indicative message, not a formal quotation revision; the
team still prepares the detailed quotation in Quotations.

Who can do what: connecting Facebook and forms needs the CRM source and
pipeline management permissions (owner / CRM manager). Changing the WhatsApp
follow-up also needs `automation.manage`.

## Rules worth knowing

- A lead form feeds one Business OS company at a time.
- Each Meta lead is imported once (tracked by Meta lead ID), so webhook retries
  and re-imports never create duplicates.
- If the phone or email already belongs to a lead in the CRM, no second lead is
  created; the repeat submission is noted on the existing lead and no WhatsApp
  message is sent.
- A lead without a valid phone number is counted as "not added".
- 10-digit numbers get the form's default country code (91 unless changed).
- Contacts who replied STOP are never messaged.
- A reply other than YES (for example a correction) is logged on the lead for a
  person to follow up, and the ordinary WhatsApp auto-replies continue.
- The confirmation waits up to 7 days for a reply.
- The lead form's privacy text should say the business may contact the person
  on WhatsApp.

## Server settings (Business App environment)

| Setting                                                    | Value                                                 |
| ---------------------------------------------------------- | ----------------------------------------------------- |
| `META_APP_ID`, `META_APP_SECRET`, `META_GRAPH_API_VERSION` | Already set for WhatsApp                              |
| `WHATSAPP_TOKEN_ENCRYPTION_KEY`                            | Already set; also encrypts Page tokens                |
| `APP_ORIGIN`                                               | Public site origin, e.g. `https://sghomesinterior.in` |
| `SUPABASE_SECRET_KEY`                                      | Already set for owner provisioning                    |
| `META_LEADS_WEBHOOK_VERIFY_TOKEN`                          | **New.** Any random text, 16+ characters              |

Optional: `META_LEADS_LOGIN_CONFIG_ID` (Facebook Login for Business
configuration; replaces the scope list), `META_LEADS_APP_ID` /
`META_LEADS_APP_SECRET` (a separate Meta app for lead forms),
`META_LEADS_PUBLIC_ORIGIN`.

Apply migration `20261112000100_meta_lead_ads.sql` to the Supabase project
before enabling. It only adds three server-only tables and four functions.

## Meta app (developers.facebook.com)

1. **Facebook Login for Business** → Valid OAuth Redirect URIs:
   `<APP_ORIGIN>/api/meta-leads/oauth/callback`
2. **Webhooks** → object **Page** → Callback URL
   `<APP_ORIGIN>/api/webhooks/meta-leads`, Verify token =
   `META_LEADS_WEBHOOK_VERIFY_TOKEN` → subscribe to the **leadgen** field.
3. **App Review** → advanced access for `leads_retrieval`,
   `pages_manage_metadata`, `pages_manage_ads`, `pages_show_list`,
   `pages_read_engagement`, `business_management`. Until approved, only people
   with a role on the app can connect.
4. In Meta **Leads Access Manager**, allow the app for each Page.

### One Meta app has one Page webhook URL

ProPulse's own lead-form integration documents using the _same_ Meta app as
Business OS, with the Page webhook pointing at
`propulsetechnologies.online/api/meta-leads/webhook`. A Meta app can deliver
Page `leadgen` events to only one callback URL. Before enabling this feature,
choose one:

- use a **separate Meta app** for Business OS lead forms
  (`META_LEADS_APP_ID` / `META_LEADS_APP_SECRET`), or
- move the Page webhook to Business OS and stop using it in ProPulse, or
- have one product forward unknown forms to the other (not built).

## Security

- Page tokens are stored encrypted (AES-256-GCM) in a table no signed-in user
  can read; only the server's service role can.
- Every Graph call carries `appsecret_proof`; webhooks are accepted only with a
  valid `X-Hub-Signature-256`.
- The Facebook login is bound to the browser, the signed-in member and their
  active company by a signed, 15-minute state.

## Verification

- `packages/database/tests/meta-lead-ads.sql` (in `pnpm db:verify` / `db:test`).
- `apps/business-app/src/lib/meta-lead-fields.test.ts` (in `pnpm test`).

Still to do on a real environment: connect a test Page, submit a test lead with
Meta's Lead Ads Testing Tool, and confirm the WhatsApp template and quotation
arrive.
