# Release artifact manifest

Release ID/tag: **rc/2026-10-05-phase11d.3**. The authoritative exact identity is the generated sanitized [rc-identity.json](release-evidence/rc-identity.json), which records the full source commit, Git tree, base commit, lockfile SHA-256, 103 ordered migration digests, 89 protected digests and package versions. Resolve the local tag to that same full SHA; never use `latest`, moving main or the workspace's historical HEAD as release identity.

The snapshot uses an isolated Git index to include source and required untracked implementation files. It excludes private `.env` inputs, caches/build outputs, local `.tools`, test reports and generated `output/` PDF previews. The working branch/index are preserved. No branch/tag has been pushed. Create an approved remote tag only through the eventual release owner's normal publication process.

Generated `apps/*/next-env.d.ts` declarations are omitted from RC `.2` and ignored, just like `.next` type outputs. Next type generation recreates them; normal/recovery imports cannot dirty the candidate checkout. RC `.1` remains at its original SHA and is superseded for this concrete clean-checkout packaging defect. Existing migration and application source bytes are unchanged by this correction.

## Artifact inventory

| Artifact           | Contents / requirement                                                               | Current provenance                                                         |
| ------------------ | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Platform Admin     | Environment-specific `.next`, public/static assets and runtime dependencies          | Actual local BUILD_ID/checksum in local-artifacts.json; no hosted artifact |
| Business App       | Same, plus Chromium/OS libraries and Sharp runtime                                   | Actual local BUILD_ID/checksum in local-artifacts.json; no hosted artifact |
| Websites           | Same Node/static/runtime requirements                                                | Actual local BUILD_ID/checksum in local-artifacts.json; no hosted artifact |
| Worker             | Frozen source/dependencies, PostgreSQL client and CA roots; restricted runtime login | Source commit identity; no hosted supervisor/image digest                  |
| Database           | Full ordered additive migration range and digest inventory                           | 103 files from 20260927000000 through 20261008000100; 89 protected         |
| Lockfile/patch     | pnpm lockfile and braces mitigation patch                                            | SHA-256 recorded from exact candidate bytes                                |
| Acceptance reports | Sanitized results for the exact candidate/project/time/operator                      | Local guard proof only; real hosted reports BLOCKED                        |

Local artifact directory checksums cover actual relative file names and SHA-256 bytes in sorted order, with counts and BUILD_ID. They are deterministic inventory hashes, not signed image/container digests or promises of byte-reproducible Next builds. Recovery fixture builds are explicitly local test artifacts and cannot be deployed as release builds.

Public Supabase values are build-time inputs. Rebuild the same pinned source separately for staging and production using the correct environment, then record the new artifact hashes, public-configuration fingerprint and provider deployment IDs privately. Do not scan/publish raw server artifacts or environment files as release evidence.

## Clean checkout verification

Clone/check out the recorded full SHA into a new isolated directory with no app `.env.local` or copied implementation file. Run frozen install, default fresh-database verification, type/seed checks, DB-enabled core tests, email/dependency/acceptance Node tests, format/lint/types, all three production builds, default Playwright, isolated recovery, client/source/artifact scans and unsuppressed full/production audits. Use a new passwordless loopback PostgreSQL database, explicit `ALLOW_TEST_DATABASE_RESET=yes` and a separate port offset for browsers. Install Chromium from the frozen Playwright version if absent. Do not use `--initialize-only` as full database acceptance.

Full canonical local results and command statuses are recorded in [local-verification.json](release-evidence/local-verification.json); local logs stay restricted under `.tools`. Historical Phase 11B restore/upgrade/retry evidence is labelled historical and is not silently rerun or upgraded to hosted proof. A clean-checkout failure is a release defect, not permission to copy an ignored local file into the candidate.

Evidence metadata is written after the immutable source snapshot. It does not alter that snapshot's source version; the actual tested checkout remains clean. Any future source change requires a new candidate and source identity, even if a subsequent documentation/evidence commit is needed for publication.
