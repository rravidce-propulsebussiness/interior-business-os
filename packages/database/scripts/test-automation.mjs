import { readFileSync } from 'node:fs';
import { psql, file } from './postgres.mjs';
console.log(psql([], readFileSync(file('tests/automation.sql'), 'utf8')));
