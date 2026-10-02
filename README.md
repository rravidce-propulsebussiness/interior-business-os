# Business OS

Phase 8 adds an optional structured website builder, published website renderer, media, SEO, CRM enquiries, version restore, domain verification and isolated frontend developer components. See [the Phase 8 verification report](docs/PHASE8-VERIFICATION.md) for local evidence and outstanding hosted acceptance. Website remains independent of the core business workflows and the future Brochure module.

Phase 7 physical execution workflows are implemented locally. The planning, inventory, subcontract, quality and handover workflows are described in [the Phase 7 verification report](docs/PHASE7-VERIFICATION.md). Hosted acceptance and full authenticated browser verification remain pending.

Phase 6 adds internal execution estimates, materials and recipes, vendor RFQs and quotes, split purchase orders, partial receiving, protected PDFs and project cost summaries. It preserves Phase 0-5 commercial and tenant boundaries. See [execution estimation](docs/EXECUTION-ESTIMATION.md), [procurement](docs/PROCUREMENT.md) and [Phase 6 verification](docs/PHASE6-VERIFICATION.md). Hosted acceptance remains outstanding. Phase 7 extends this with physical execution; workforce attendance and payroll remain deferred.

## Start locally

Use Node 24 (see .node-version) and pnpm 10.34.5. If pnpm is not installed, use Corepack (`corepack pnpm`) or `npm exec --yes --package=pnpm@10.34.5 -- pnpm <command>`. On Windows with restricted PowerShell scripts, use `npm.cmd`.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

| App                 | Local URL             | Purpose                       |
| ------------------- | --------------------- | ----------------------------- |
| apps/platform-admin | http://localhost:3000 | Platform control plane shell  |
| apps/business-app   | http://localhost:3001 | Tenant workspace shell        |
| apps/websites       | http://localhost:3002 | Public website delivery shell |

Public landing pages run without credentials. For authentication, copy .env.example into both administration apps as .env.local and set the Supabase URL and publishable key. Neither app uses a service-role key. Follow [Supabase setup](docs/SUPABASE.md) before signing in. To run one app: `pnpm --filter @business-os/business-app dev`.

## Verify

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

`pnpm check` runs all checks, including builds and E2E (install Chromium first). E2E starts all three production servers automatically; ports 3000–3002 must be free. `pnpm format` applies formatting. Build apps sequentially to keep local resource usage predictable. Package TypeScript is consumed directly by Next.js; packages do not emit separate distributions.

Database verification is separate and requires PostgreSQL plus a **new disposable database**. Set `TEST_DATABASE_URL` and `ALLOW_TEST_DATABASE_RESET=yes`, then run `pnpm db:verify` and `pnpm db:types:check`. The verifier refuses nonempty databases and does not drop anything. It applies every migration, tests RLS as application roles and verifies repeatable development seeds. `pnpm db:test` reruns transactional security tests on that initialized test database. CI runs these database checks before `pnpm check`.

Default Playwright coverage needs no Supabase credentials. Hosted login/membership tests are opt-in with `E2E_LIVE_SUPABASE=true`, `E2E_OWNER_EMAIL` and `E2E_OWNER_PASSWORD`; otherwise they are explicitly skipped. See [Phase 1 verification](docs/PHASE1-VERIFICATION.md) for executed results and limitations.

## Workspace

After Supabase setup, use the Business dashboard's Catalog and Pricing links. Configure categories/items, questions/options/dependencies, price books, effective rates and modifiers. The item preview calls the same engine intended for future quotations and can download a calculation snapshot. See [catalog configuration](docs/CATALOG.md), [pricing semantics](docs/PRICING-ENGINE.md) and [Phase 2 verification](docs/PHASE2-VERIFICATION.md). Apply the optional `seed-catalog.sql` after `seed-users.sql` for the Interior demo. Never apply development seeds to production.

All requested packages live under packages/: database, auth, ui, core, quotation-engine, website-builder, industry-interior and shared. Database owns Supabase clients, repositories, migrations and generated types. Auth owns the original pure access policy plus verified server context/services. UI provides shared forms and states. Industry-neutral domain boundaries and reserved later-phase packages are preserved.

Read [product scope](docs/PRODUCT.md), [architecture and ADRs](docs/ARCHITECTURE.md), [database design](docs/DATABASE.md), [permissions](docs/PERMISSIONS.md), [development standards](docs/DEVELOPMENT.md) and [roadmap](docs/ROADMAP.md) before implementing features.

Framework setup follows the official [Next.js installation guide](https://nextjs.org/docs/app/getting-started/installation) and [Tailwind Next.js guide](https://tailwindcss.com/docs/installation/framework-guides/nextjs). Dependency versions are reproducible through the committed lockfile. The original Phase 0 results remain in docs/VERIFICATION.md. Current catalog/pricing results and limitations are in docs/PHASE2-VERIFICATION.md.
