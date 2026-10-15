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
  const committed = readFileSync(target, 'utf8');
  if (committed !== out) {
    const currentLines = committed.split('\n');
    const expectedLines = out.split('\n');
    const index = expectedLines.findIndex((line, i) => line !== currentLines[i]);
    console.error('Database type mismatch near line', index + 1);
    console.error('Committed:', currentLines.slice(Math.max(0, index - 2), index + 5).join('\n'));
    console.error('Generated:', expectedLines.slice(Math.max(0, index - 2), index + 5).join('\n'));

    // Emit a compact patch so checked-in generated types can be reconciled
    // with the current public schema without weakening the drift guard.
    const left = committed.split('\n');
    const right = out.split('\n');
    const patches = [];
    let leftAt = 0, rightAt = 0;
    while (leftAt < left.length || rightAt < right.length) {
      if (left[leftAt] === right[rightAt]) { leftAt++; rightAt++; continue; }
      const i = leftAt, j = rightAt;
      let leftAhead = -1, rightAhead = -1;
      for (let offset = 1; offset <= 250; offset++) {
        if (leftAhead < 0 && i + offset < left.length && left[i + offset] === right[j])
          leftAhead = offset;
        if (rightAhead < 0 && j + offset < right.length && right[j + offset] === left[i])
          rightAhead = offset;
        if (leftAhead >= 0 && rightAhead >= 0) break;
      }
      if (rightAt < right.length &&
          (rightAhead >= 0 && (leftAhead < 0 || rightAhead <= leftAhead) || leftAt >= left.length)) {
        const count = rightAhead >= 0 ? rightAhead : right.length - rightAt;
        patches.push({ start: leftAt, remove: 0, insert: right.slice(rightAt, rightAt + count) });
        rightAt += count;
      } else if (leftAt < left.length &&
          (leftAhead >= 0 || rightAt >= right.length)) {
        const count = leftAhead >= 0 ? leftAhead : left.length - leftAt;
        patches.push({ start: leftAt, remove: count, insert: [] });
        leftAt += count;
      } else {
        patches.push({ start: leftAt, remove: 1, insert: [right[rightAt]] });
        leftAt++; rightAt++;
      }
    }
    const reconstructed = [...left];
    for (const p of [...patches].reverse()) reconstructed.splice(p.start, p.remove, ...p.insert);
    if (reconstructed.join('\n') !== out) throw new Error('Internal generated type diff reconstruction failed');
    const serialized = JSON.stringify(patches);
    console.error('GEN_TYPE_PATCH_START');
    for (let offset = 0; offset < serialized.length; offset += 4000)
      console.error('GEN_TYPE_PATCH:' + serialized.slice(offset, offset + 4000));
    console.error('GEN_TYPE_PATCH_END');
    throw new Error('Generated database types have drifted. Run db:types.');
  }
  console.log('Generated database types match the applied schema.');
} else {
  mkdirSync(file('src/generated'), { recursive: true });
  writeFileSync(target, out);
  console.log('Generated database types from PostgreSQL.');
}
