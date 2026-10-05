# Sanitized release evidence

Store only non-sensitive reproducible metadata here. Phase 11D adds source identity, local command summaries and local artifact inventory after freezing the source snapshot. No hosted result is claimed. Raw logs, screenshots, mail bodies, target plans, credentials, capability URLs, recipients, customer data and private server artifacts remain outside Git in restricted operator storage.

Every later hosted evidence record must bind RC ID, full commit, environment/project fingerprint, migration state, UTC time, tester/release-owner IDs, scenario/check ID, status and sanitized evidence reference. PASS requires the actual expected result; missing infrastructure or signer is BLOCKED. Do not edit machine results to manufacture PASS. Failed evidence remains available alongside the explained retest.

Use `GREEN = PASS`, `RED = FAIL`, `GRAY = BLOCKED`, `BLUE = NOT APPLICABLE` in the final board. Those colors are presentation labels, not additional statuses. Risk disposition is recorded separately from gate status; MITIGATED never means a blocked security gate has passed.
