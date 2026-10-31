# Same Hostinger Node.js app for Business OS and company public sites

The existing app at https://sghomesinterior.in remains the only Hostinger
Node.js service. Hostinger's default subdomain folder does not forward to it.

## Trust boundaries

The Cloudflare Worker sends a request to the *existing apex hostname*,
retaining the visitor's company hostname in timestamped HMAC-SHA256 headers.
The Next.js proxy validates the exact hostname, request method, path, query
and the timestamp before setting an internal public hostname header.

Untrusted headers are always stripped in the app proxy. The published
website RPC independently requires an active domain, TLS-ready status,
a published version and valid entitlement.

## Prepare

1. Confirm sghomesinterior.in, /login, /api/health work after Cloudflare
   nameserver activation. Keep apex, www and email DNS entries intact.
2. Publish the GitHub change through the *existing* Hostinger deployment.
3. Generate a new, random 32-byte secret locally or in a secure password
   manager. Do not publish it in Git, logs, chat, or a public variable.
4. Save the identical value into:
   - Existing Hostinger Node app private environment variable
     BUSINESS_OS_PUBLIC_EDGE_SECRET
   - Cloudflare Worker encrypted secret BUSINESS_OS_PUBLIC_EDGE_SECRET
5. In Hostinger also set:
   BUSINESS_OS_PUBLIC_WEBSITE_ROUTING_ENABLED=true
   BUSINESS_OS_PUBLIC_WEBSITE_BASE_DOMAIN=sghomesinterior.in
   Keep BUSINESS_OS_SERVICE=business-app. Restart the existing Node app.
6. Create a **Proxied** Cloudflare A record named
   neelima-constructions, pointing to 192.0.2.0 (reserved, never reached
   because the Worker handles that route). If an exact record already
   exists, update its settings instead of adding duplicates.
7. Deploy infra/cloudflare/public-company-sites/worker.mjs with a route
   neelima-constructions.sghomesinterior.in/*.
8. Confirm the exact test URL
   https://neelima-constructions.sghomesinterior.in/api/health
   returns the same liveness response as the apex. Also test a static
   Next.js asset path and HTTPS certificate.
9. Confirm the website_domains managed subdomain record exists for the
   published Neelima site. If missing, insert it safely as pending.
   Only after verified HTTPS and hostname forwarding work should an
   authorized operator mark it active, tls_status=ready and verified_at.
10. Check the published home page, nested pages, media, enquiries,
    sitemap, robots and 404s for unknown/unpublished websites.

## Promote to all companies

After successfully testing Neelima:

1. Add a Proxied wildcard DNS record named * pointing to 192.0.2.0.
2. Replace the Worker route with *.sghomesinterior.in/*.
3. Exclude service hosts (especially www) with a more-specific
   pass-through/no-Worker route if they are proxied.
4. Confirm existing apex, www and mail service behavior still works.
5. Register and activate each company hostname only after its HTTPS
   and published website are verified.

## Safety & rollback

- Do not redirect apex to a company or move Business OS to a second app.
- Never expose the shared HMAC secret via NEXT_PUBLIC_ variables.
- Never enable managed_subdomain_tls in Supabase solely because DNS
  resolves. Enable it only after wildcard HTTPS and routing are verified.
- Rollback: remove the Cloudflare Worker route (and optionally the
  company DNS entry), turn off
  BUSINESS_OS_PUBLIC_WEBSITE_ROUTING_ENABLED and restart Hostinger.
- If a company shows the Hostinger page/404 rather than the Business OS
  health JSON, Cloudflare is not forwarding it to the existing app.
