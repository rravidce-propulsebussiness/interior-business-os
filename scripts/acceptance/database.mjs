import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { AcceptanceError } from './http.mjs';

export const sha = (value) => createHash('sha256').update(value).digest('hex');
export function database(env, sql, { readOnly = true } = {}) {
  // Passwords are passed through the child environment, not process arguments.
  const u = new URL(env.HOSTED_DATABASE_URL ?? env.TEST_DATABASE_URL);
  const child = {
    ...Object.fromEntries(
      [
        'PATH',
        'PATHEXT',
        'SystemRoot',
        'WINDIR',
        'LANG',
        'TZ',
        'PGSSLROOTCERT',
        'PGSSLCERT',
        'PGSSLKEY',
      ]
        .filter((k) => env[k])
        .map((k) => [k, env[k]]),
    ),
    PGHOST: u.hostname,
    PGPORT: u.port || '5432',
    PGDATABASE: decodeURIComponent(u.pathname.slice(1)),
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGSSLMODE: u.searchParams.get('sslmode') || 'disable',
    PGCONNECT_TIMEOUT: '10',
    PGOPTIONS: '-c statement_timeout=45000 -c lock_timeout=5000',
    PSQL_HISTORY: '',
  };
  const result = spawnSync(
    env.PSQL_PATH ||
      (process.platform === 'win32'
        ? 'C:/Program Files/PostgreSQL/18/bin/psql.exe'
        : 'psql'),
    ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'],
    {
      env: child,
      input: `begin${readOnly ? ' read only' : ''};\n${sql}\n${readOnly ? 'rollback' : 'commit'};\n`,
      encoding: 'utf8',
      timeout: 60000,
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  if (result.error || result.status !== 0)
    throw new Error('DATABASE_OPERATION_FAILED');
  return result.stdout.trim();
}
export const literal = (v) => "'" + String(v).replaceAll("'", "''") + "'";
export function verifyMarker(env, target) {
  if (env.ACCEPTANCE_ENVIRONMENT !== 'staging')
    throw new AcceptanceError(
      'STAGING_MARKER_REQUIRED',
      'CONFIGURATION_FAILURE',
    );
  const row = JSON.parse(
    database(
      env,
      `select json_build_object('environment',environment,'projectRef',project_ref,'markerId',marker_id,'expires',expires_at>now()) from acceptance_control.target where singleton;`,
    ),
  );
  if (
    row.environment !== 'staging' ||
    row.projectRef !== env.ACCEPTANCE_PROJECT_REF ||
    row.markerId !== target.markerId ||
    row.expires !== true
  )
    throw new Error('REMOTE_STAGING_MARKER_MISMATCH');
}
export function migrationFiles() {
  return readdirSync('packages/database/supabase/migrations')
    .filter((n) => /^\d{14}_.+\.sql$/.test(n))
    .sort()
    .map((name) => ({
      name,
      version: name.slice(0, 14),
      sha256: sha(
        readFileSync(`packages/database/supabase/migrations/${name}`),
      ),
    }));
}
export function protectedHashes() {
  const protectedFiles = JSON.parse(
    readFileSync(
      'packages/database/supabase/preserved-migrations.json',
      'utf8',
    ),
  );
  if (
    Object.keys(protectedFiles).length !== 89 ||
    migrationFiles().filter((m) => protectedFiles[m.name] === m.sha256)
      .length !== 89
  )
    throw new Error('PROTECTED_MIGRATION_DRIFT');
}
// Compare catalog objects, not pg_dump ownership/server-version boilerplate.
// Local-only test helpers are excluded; application public/private objects are not.
export const catalogSql = `
select coalesce(json_agg(x order by kind,identity),'[]') from (
 select 'table' kind, n.nspname||'.'||c.relname identity, jsonb_build_object('rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,'kind',c.relkind) definition from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind in ('r','p','v')
 union all select 'column', n.nspname||'.'||c.relname||'.'||a.attname, jsonb_build_object('type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated) from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where n.nspname in ('public','private') and c.relkind in ('r','p','v') and a.attnum>0 and not a.attisdropped
 union all select 'function',n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',jsonb_build_object('definition',pg_get_functiondef(p.oid),'securityDefiner',p.prosecdef,'config',p.proconfig,'volatility',p.provolatile) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prokind='f' and not exists(select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')
 union all select 'policy',n.nspname||'.'||c.relname||'.'||p.polname,jsonb_build_object('cmd',p.polcmd,'permissive',p.polpermissive,'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid),'roles',(select jsonb_agg(case when r=0 then 'PUBLIC' else pg_get_userbyid(r) end order by r) from unnest(p.polroles) r)) from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private')
 union all select 'constraint',n.nspname||'.'||c.relname||'.'||k.conname,jsonb_build_object('definition',pg_get_constraintdef(k.oid),'validated',k.convalidated) from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private')
 union all select 'index',n.nspname||'.'||c.relname,jsonb_build_object('definition',pg_get_indexdef(i.indexrelid),'valid',i.indisvalid) from pg_index i join pg_class c on c.oid=i.indexrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private')
 union all select 'trigger',n.nspname||'.'||c.relname||'.'||t.tgname,jsonb_build_object('definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and not t.tgisinternal
 union all select 'function-grant',n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||'):'||case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end||':'||a.privilege_type,jsonb_build_object('grantable',a.is_grantable) from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where n.nspname in ('public','private') and a.grantee<>p.proowner and not exists(select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')
 union all select 'table-grant',n.nspname||'.'||c.relname||':'||case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end||':'||a.privilege_type,jsonb_build_object('grantable',a.is_grantable) from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a where n.nspname in ('public','private') and c.relkind in ('r','p','v') and a.grantee<>c.relowner
) x;`;
export function catalog(env) {
  return JSON.parse(database(env, catalogSql))
    .map((o) => ({ ...o, sha256: sha(JSON.stringify(o.definition)) }))
    .map(({ kind, identity, sha256 }) => ({ kind, identity, sha256 }));
}
export function verifyMigrations(env, reference) {
  protectedHashes();
  const local = migrationFiles();
  if (JSON.stringify(local) !== JSON.stringify(reference.migrations))
    throw new Error('LOCAL_REFERENCE_MIGRATION_DRIFT');
  const history = JSON.parse(
    database(
      env,
      "select coalesce(json_agg(version order by version),'[]') from supabase_migrations.schema_migrations;",
    ),
  );
  if (JSON.stringify(history) !== JSON.stringify(local.map((m) => m.version)))
    throw new Error('HOSTED_MIGRATION_HISTORY_DRIFT');
  const actual = catalog(env);
  const expected = new Map(
    reference.catalog.map((o) => [o.kind + ':' + o.identity, o.sha256]),
  );
  const drift =
    actual.filter((o) => expected.get(o.kind + ':' + o.identity) !== o.sha256)
      .length +
    reference.catalog.filter(
      (o) =>
        !actual.some((a) => a.kind === o.kind && a.identity === o.identity),
    ).length;
  if (drift)
    throw new AcceptanceError('HOSTED_CATALOG_DRIFT', 'CODE_FAILURE', {
      missing: drift,
      catalogObjects: actual.length,
    });
  if (
    sha(readFileSync('packages/database/src/generated/database.types.ts')) !==
    reference.generatedTypesSha256
  )
    throw new Error('GENERATED_TYPES_REFERENCE_DRIFT');
  return {
    migrations: local.length,
    protectedMigrations: 89,
    catalogObjects: actual.length,
  };
}
