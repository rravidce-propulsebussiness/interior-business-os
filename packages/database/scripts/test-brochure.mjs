import { readFileSync } from 'node:fs';
import { psql, file } from './postgres.mjs';
const doc = JSON.parse(
  readFileSync(file('tests/brochure-fixture.json'), 'utf8'),
);
const sql = readFileSync(file('tests/brochure.sql'), 'utf8').replace(
  '/*DOCUMENT*/',
  "'" + JSON.stringify(doc).replaceAll("'", "''") + "'",
);
console.log(psql([], sql));
