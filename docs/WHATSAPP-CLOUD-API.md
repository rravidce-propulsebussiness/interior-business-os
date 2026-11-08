# WhatsApp Cloud API onboarding

This integration connects each company workspace to its own WhatsApp Business Account through Meta Embedded Signup. It does not ask customers for a Facebook password or verification code.

## Server configuration

Set these on the Business OS server only:

- `META_APP_ID`: Propulse Messaging app ID.
- `META_APP_SECRET`: Meta App Secret. Keep private.
- `META_EMBEDDED_SIGNUP_CONFIG_ID`: WhatsApp Embedded Signup v4 configuration ID.
- `META_GRAPH_API_VERSION`: supported Graph version in the form `vNN.0`.
- `WHATSAPP_TOKEN_ENCRYPTION_KEY`: 32 random bytes encoded as 64 hexadecimal characters. Generate a new value for each environment and store it only in the host's secret/environment settings.
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`: a separate random verification string; do not reuse the app secret.

The signup route exchanges the one-time Meta code on the server, verifies the WABA and selected phone number with Graph API, subscribes the app to the WABA, and stores the returned token using AES-256-GCM. The browser receives only a success status and safe account metadata. Webhook POST requests are checked against Meta's `X-Hub-Signature-256` before events are stored. Webhook event rows are service-role only and have a 30-day expiry field.

## Meta configuration and release gates

- Keep the app in Development mode while testing; add test users as app roles.
- Configure the app webhook callback as `https://sghomesinterior.in/api/webhooks/whatsapp`, use the server verification token, and subscribe the WhatsApp product to `messages` and status fields needed by the product.
- Embedded Signup and Graph API calls require HTTPS.
- Meta requires App Review and advanced access for the permissions needed to release a Tech Provider integration to customers. The current app and signup configuration still need those gates completed.
- App Privacy Policy, Terms, and Data Deletion URLs must be publicly reachable and reviewed against actual data handling before production release. The related Business OS pages are in a separate review pull request.

## Current product boundary

The WhatsApp workspace handles the inbox, templates, and WhatsApp automation replies. The generic automation builder remains separate and does not send WhatsApp messages.

## Connections and numbers

- Each connected phone number has its own row and encrypted token, so one WhatsApp Business Account can hold several numbers.
- A number can be connected to only one company at a time. Disconnect it there before connecting it to another company. Disconnected rows stay so message history keeps its connection.
- Webhook changes go to the number named in `metadata.phone_number_id`. Numbers with no live connection are ignored. Changes with no number are stored as account-level events and never enter an inbox.
- Apply migration `20261107000000_whatsapp_multi_number_connections.sql` before or with this code.

## Troubleshooting Meta errors

Routes return a plain message and `metaCode` when Meta supplies one, with status 424 for Meta failures and 500 for internal failures. Do not use 502 or 504 here: Cloudflare replaces those with its own HTML page and hides the message. Server logs record `whatsapp_meta_error` with the HTTP status, code, subcode, and `fbtrace_id` only. Meta's own error text and tokens are never logged or returned, because that text can contain account details.

## WhatsApp voice calling (preview)

A dedicated `Calls` tab and the contact-header Call action now use the official Meta call-settings, call-permissions and call-signaling endpoints. Calls are not automatically activated on any connected business number.

To run a controlled calling test:

1. In Meta WhatsApp Manager select the target phone number under **Account tools > Phone numbers > Calls**. Verify that the number is eligible (Meta requires the 2,000-conversation messaging tier for production calling) and that the app has the required advanced permissions.
2. In Meta for Developers subscribe the app's **WhatsApp Business Account** webhook to the **calls** field. Keep the existing `https://sghomesinterior.in/api/webhooks/whatsapp` endpoint and signature verification. Do not create an unverified second webhook.
3. Open Business OS > WhatsApp > Calls, choose the exact number, and refresh Meta status. When Meta reports `NOT SET`, `NOT_SET`, `NOT_CONFIGURED` or `DISABLED`, a workspace user with `automation.manage` permission can click **Activate with Meta (private)**. This requests `calling.status=ENABLED` with `call_icon_visibility=DISABLE_ALL`, so it does **not** advertise an untested public call button. If the action is rejected, check the business phone number's Meta eligibility tier and app access. After approval, configure a TURN relay and subscribe the `calls` webhook field, keep an agent online, then explicitly use **Show customer call button**. Use **Hide customer call button** when the team is offline.
4. Open a recent customer chat, select **Call**, and refresh call permission. If Meta allows it and the customer wrote within the last 24 hours, send the interactive permission request, await approval, refresh, then dial. Direct outbound calls without Meta-approved permission are blocked in both the browser and server.
5. Test incoming Answer/Decline, outbound connect, mute, termination and audio in Chrome on HTTPS with microphone access. Incoming signals are polled from the signed, service-role-only webhook queue; the browser never receives Meta tokens. SDP is limited to recent call events and is returned only to callers holding `automation.manage`.

**Limitations before production launch:** This preview uses browser WebRTC and a public STUN server; restrictive networks can require an authenticated TURN relay with short-lived credentials. Agents must have the Business OS open to receive calls. Call history, multi-agent arbitration, push notifications, centralized media servers, QoS checks, automated end-to-end audio tests, and SIP trunk routing are not yet provided. Do not advertise 24/7 calling until the agent workflow, TURN connectivity and production Meta eligibility have been validated. Do not turn on the call button for an unstaffed number.

### WebRTC relay configuration

The Calls workspace first asks its authenticated server endpoint for ICE servers. By
default it uses STUN only, which is **not reliable on restrictive mobile and
office networks**.

**Recommended: Cloudflare Realtime TURN.** Shared hosting cannot run a TURN
server (it needs open UDP ports), so use Cloudflare's managed relay:

1. Cloudflare dashboard → **Realtime** → **TURN Server** → **Create** a TURN key.
2. Copy the **Turn Token ID** (32 hex characters) and the **API Token** shown once.
3. Set these **server-side** variables on Hostinger, then redeploy:

```dotenv
WHATSAPP_TURN_CLOUDFLARE_KEY_ID=<32-hex Turn Token ID>
WHATSAPP_TURN_CLOUDFLARE_API_TOKEN=<API token for that key>
```

For every call the server asks Cloudflare for credentials that expire after
60 minutes; the API token never reaches the browser. Port-53 TURN URLs are
dropped because browsers block them. If Cloudflare is unreachable the call
falls back to STUN (and coturn, if configured) instead of failing outright.

**Alternative: self-hosted coturn.** Provision an external coturn server
(or a compatible managed TURN service using the coturn REST shared-secret
credential scheme). Configure **server-side** environment variables:

```dotenv
WHATSAPP_TURN_URLS=turn:relay.example.com:3478?transport=udp,turns:relay.example.com:5349?transport=tcp
WHATSAPP_TURN_SHARED_SECRET=<long-secret-matching-the-turn-server>
```

The TURN server must use its REST/shared-secret authentication mechanism
(`use-auth-secret` and `static-auth-secret` in coturn). HTTPS/TLS certificate
management and UDP/TCP firewall access remain the relay operator's
responsibility. Credentials issued to browsers expire after 60 minutes. The
shared secret **must not** have a `NEXT_PUBLIC_` prefix or be exposed in
client bundles. Restart the Business OS server after setting these variables.

If a managed provider only supports permanent usernames/passwords or its own
token API, use its supported short-lived credential integration rather than
pasting static TURN credentials into the browser or these variables.

**Operational readiness:** enable the Meta `calls` webhook field, verify the
number's Calling API status, ensure agents are online to answer, configure
TURN, then place a real inbound and outbound call and confirm audio in both
directions. The UI alone cannot establish that Meta has activated calling.
Incoming calls now send `pre_accept` before `accept` with the same complete
(non-trickle) SDP answer.

### Calling shows NOT SET

Meta does not automatically enable Calling API on a new business phone number. A number with a status of `NOT SET` is not yet ready for customer calling; customer permission checks and call attempts will fail until the business number is activated. The Calls tab now displays a deliberate private activation action for this state. Meta currently requires at least the 2,000 business-initiated conversation limit (the _messaging tier_, not that many actual daily messages) for production Calling API access. If Meta refuses activation, check the phone's Calls tab in WhatsApp Manager, its messaging limit, and the app's advanced `whatsapp_business_management` permission. Never bypass these checks or claim eligibility based on a connected messaging number alone.

The public call icon is deliberately **not** turned on by the first activation request. Publishing it requires a configured TURN relay and separate human confirmation that call webhooks and agents are ready. The server cannot establish from a missing call event alone whether Meta's `calls` field is subscribed, and the business number must be tested end-to-end before a production launch.
