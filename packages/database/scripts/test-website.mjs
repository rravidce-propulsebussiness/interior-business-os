import { readFileSync } from 'node:fs';
import { psql, file } from './postgres.mjs';
const document = JSON.parse(
  readFileSync(file('tests/website-fixture.json'), 'utf8'),
);
const quote = (value) =>
  "'" + JSON.stringify(value).replaceAll("'", "''") + "'";
const sql = readFileSync(file('tests/website.sql'), 'utf8').replace(
  '/*DOCUMENT*/',
  quote(document),
);
console.log(psql([], sql));
