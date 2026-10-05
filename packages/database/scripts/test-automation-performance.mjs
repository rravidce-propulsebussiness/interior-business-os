import { psql, file } from './postgres.mjs';
console.log(psql(['-f', file('tests/automation-performance.sql')]));
