import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { format } from 'prettier';
import { file, psql } from './postgres.mjs';

const rows = JSON.parse(
  psql([
    '-Atc',
    `select coalesce(json_agg(x),'[]') from (select table_name,column_name,data_type,udt_name,is_nullable,column_default from information_schema.columns where table_schema='public' order by table_name,ordinal_position) x`,
  ]),
);
const functions = JSON.parse(
  psql([
    '-Atc',
    `select coalesce(json_agg(x),'[]') from (select p.proname as name, pg_get_function_result(p.oid) as result, p.pronargdefaults as defaults, coalesce((select json_agg(json_build_object('name',p.proargnames[i],'type',format_type(p.proargtypes[i-1],null)) order by i) from generate_series(1,p.pronargs) i),'[]') as args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' order by p.proname) x`,
  ]),
);
const relationships = JSON.parse(
  psql([
    '-Atc',
    `select coalesce(json_agg(x),'[]') from (select cl.relname as table_name,c.conname as "foreignKeyName",(select json_agg(a.attname order by k.ord) from unnest(c.conkey) with ordinality k(num,ord) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.num) as columns,exists(select 1 from pg_constraint u where u.conrelid=c.conrelid and u.contype in ('p','u') and u.conkey @> c.conkey and c.conkey @> u.conkey) as "isOneToOne",r.relname as "referencedRelation",(select json_agg(a.attname order by k.ord) from unnest(c.confkey) with ordinality k(num,ord) join pg_attribute a on a.attrelid=c.confrelid and a.attnum=k.num) as "referencedColumns" from pg_constraint c join pg_class cl on cl.oid=c.conrelid join pg_namespace n on n.oid=cl.relnamespace join pg_class r on r.oid=c.confrelid join pg_namespace rn on rn.oid=r.relnamespace where c.contype='f' and n.nspname='public' and rn.nspname='public' order by cl.relname,c.conname) x`,
  ]),
);
function type(sql) {
  if (sql.endsWith('[]')) return `${type(sql.slice(0, -2))}[]`;
  return /json/.test(sql)
    ? 'Json'
    : /bool/.test(sql)
      ? 'boolean'
      : /int|numeric|double|real/.test(sql)
        ? 'number'
        : sql === 'void'
          ? 'undefined'
          : 'string';
}
let out =
  '// Generated from the applied PostgreSQL catalog by scripts/generate-types.mjs. Do not edit.\nexport type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];\nexport interface Database { public: { Tables: {\n';
for (const table of [...new Set(rows.map((r) => r.table_name))]) {
  const columns = rows.filter((r) => r.table_name === table);
  out += `${JSON.stringify(table)}: {\n`;
  for (const shape of ['Row', 'Insert', 'Update']) {
    out += `${shape}: {\n`;
    for (const c of columns)
      out += `${JSON.stringify(c.column_name)}${shape === 'Update' || (shape === 'Insert' && (c.column_default !== null || c.is_nullable === 'YES')) ? '?' : ''}: ${type(c.data_type)}${c.is_nullable === 'YES' ? ' | null' : ''};\n`;
    out += '};\n';
  }
  out += `Relationships: ${JSON.stringify(
    relationships
      .filter((r) => r.table_name === table)
      .map(({ table_name, ...relationship }) => {
        void table_name;
        return relationship;
      }),
  )}; };\n`;
}
out += '}; Views: Record<string, never>; Functions: {\n';
for (const f of functions)
  out += `${JSON.stringify(f.name)}: { Args: ${f.args.length ? `{${f.args.map((a, i) => `${JSON.stringify(a.name)}${i >= f.args.length - f.defaults ? '?' : ''}: ${type(a.type)}`).join(';')}}` : 'Record<string, never>'}; Returns: ${type(f.result)} };\n`;
out +=
  '}; Enums: Record<string, never>; CompositeTypes: Record<string, never>; }; }\n';
out = await format(out, {
  parser: 'typescript',
  singleQuote: true,
  trailingComma: 'all',
});
const target = file('src/generated/database.types.ts');
if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8') !== out)
    throw new Error('Generated database types have drifted. Run db:types.');
  console.log('Generated database types match the applied schema.');
} else {
  mkdirSync(file('src/generated'), { recursive: true });
  writeFileSync(target, out);
  console.log('Generated database types from PostgreSQL.');
}
