# Website domains and HTTPS

Platform Admin configures the base hostname and confirms externally configured wildcard routing and TLS. Configure the reverse proxy or hosting platform to forward the original Host to the Websites application. Never route Business App cookies to tenant website origins. Changing the base hostname does not rename existing domain records.

A business with custom-domain capability adds its hostname, then creates TXT _business-os.HOST with the exact business-os-verification=CHALLENGE value and a CNAME to the configured platform hostname. Each hostname has one active claim; pending claims do not serve content. Removal immediately stops resolution. Domain changes are tenant-scoped, audited and version checked.

The verification action resolves TXT and IPv4 A records on the server, compares target addresses to the platform destination, rejects private/special addresses and pins the verified address for a TLS connection using the hostname as SNI. It validates the certificate and records DNS and TLS states separately. A short-lived HMAC attestation binds the exact organization, domain, hostname and challenge. Browser-supplied verified=true is never accepted.

Certificate issuance is the deployment platform's responsibility. This code verifies an already provisioned certificate; it does not impersonate an ACME issuer or claim automatic provisioning. IPv6-only and proxy configurations with nonmatching address sets require an additional deployment adapter. Until DNS and TLS pass, the custom domain does not serve a website. Live DNS, certificates and hosted wildcard routing have not been tested locally.
