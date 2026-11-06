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

Routes return a plain message and `metaCode` when Meta supplies one. Server logs record `whatsapp_meta_error` with the HTTP status, code, subcode, and `fbtrace_id` only. Meta's own error text and tokens are never logged or returned, because that text can contain account details.
