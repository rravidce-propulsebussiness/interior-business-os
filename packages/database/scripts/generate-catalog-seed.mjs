import { readFileSync, writeFileSync } from 'node:fs';
const starter = JSON.parse(
  readFileSync(
    new URL('../../industry-interior/src/starter.json', import.meta.url),
    'utf8',
  ),
);
const quote = (value) =>
  value === null ? 'null' : "'" + String(value).replaceAll("'", "''") + "'";
const id = (key) =>
  `private.seed_uuid(${quote('business-os:interior-demo:' + key)})`;
const org = "'dddddddd-dddd-4ddd-8ddd-dddddddddddd'::uuid";
let sql = `-- Generated from industry-interior/src/starter.json. Development only; never overwrites masters.\nbegin;\ndo $$ begin if not exists(select 1 from public.organizations where id=${org} and slug='demo-interiors') then raise exception 'Prepare the documented demo organization first'; end if; end $$;\n`;
function insert(table, values) {
  sql += `insert into public.${table} (${Object.keys(values).join(',')}) values (${Object.values(values).join(',')}) on conflict(id) do nothing;\n`;
}
for (const c of starter.categories)
  insert('catalog_categories', {
    id: id(c.key),
    organization_id: org,
    key: quote(c.key),
    name: quote(c.name),
    industry_id: "(select id from public.industries where key='interior')",
  });
insert('price_books', {
  id: id('standard_book'),
  organization_id: org,
  key: "'interior_standard'",
  name: "'Interior Standard'",
  currency: quote(starter.currency),
  is_default: 'true',
  valid_from: "'2026-01-01T00:00:00Z'",
});
for (const item of starter.items) {
  insert('catalog_items', {
    id: id(item.key),
    organization_id: org,
    key: quote(item.key),
    name: quote(item.name),
    category_id: id(item.category),
    industry_id: "(select id from public.industries where key='interior')",
    unit_key: quote(item.unit),
    method_key: quote(item.method),
  });
  insert('price_book_items', {
    id: id(item.key + ':rate'),
    organization_id: org,
    item_id: id(item.key),
    currency: quote(starter.currency),
    base_rate: quote(item.rate),
    minimum_rate: quote(item.minimum ?? null),
    valid_from: "'2026-01-01T00:00:00Z'",
  });
  if (item.cost)
    insert('pricing_costs', {
      id: id(item.key + ':cost'),
      organization_id: org,
      rate_id: id(item.key + ':rate'),
      estimated_cost_rate: quote(item.cost),
    });
}
for (const [index, a] of starter.wardrobeQuestions.entries()) {
  insert('catalog_item_attributes', {
    id: id('attribute:' + a.key),
    organization_id: org,
    item_id: id('wardrobe'),
    key: quote(a.key),
    label: quote(a.label),
    input_type: "'select'",
    affects_pricing: 'true',
    required: 'true',
    sort_order: String(index),
    conditions: quote(JSON.stringify(a.conditions ?? [])) + '::jsonb',
  });
  for (const [order, o] of a.options.entries()) {
    insert('catalog_attribute_options', {
      id: id('option:' + a.key + ':' + o.key),
      organization_id: org,
      item_id: id('wardrobe'),
      attribute_id: id('attribute:' + a.key),
      key: quote(o.key),
      label: quote(o.label),
      sort_order: String(order),
    });
    insert('pricing_modifiers', {
      id: id('modifier:' + a.key + ':' + o.key),
      organization_id: org,
      item_id: id('wardrobe'),
      option_id: id('option:' + a.key + ':' + o.key),
      label: quote(a.label + ': ' + o.label),
      kind: "'per_unit'",
      value: quote(o.value),
    });
  }
}
sql += `select private.validate_catalog(${org});\ncommit;\n`;
const path = new URL('../supabase/seed-catalog.sql', import.meta.url);
if (process.argv.includes('--check')) {
  if (readFileSync(path, 'utf8') !== sql) throw new Error('Catalog seed drift');
  console.log('Catalog seed matches starter data.');
} else writeFileSync(path, sql);
