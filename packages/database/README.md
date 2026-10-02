# Database boundary

Owns additive PostgreSQL migrations, generated Supabase-compatible types, browser/server clients and server-only repositories. Runtime calls use publishable credentials plus the authenticated user's JWT. There is no service-role client or ORM.

See [database standards](../../docs/DATABASE.md) and [setup](../../docs/SUPABASE.md). server, repository and proxy exports are guarded with server-only. The browser export contains only publishable configuration. db:verify applies migrations to a new disposable PostgreSQL database, tests RLS under application roles and verifies repeatable seeds; db:types generates the supported public table/function types from that catalog. Private-schema functions are not part of generated client APIs.
