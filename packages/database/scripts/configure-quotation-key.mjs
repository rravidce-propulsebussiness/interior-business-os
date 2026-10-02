import { psql } from './postgres.mjs';
// Operator-only script. Input arrives through environment; no key is printed or
// placed on a command line. TEST_DATABASE_URL must identify the intended database.
const key = process.env.QUOTATION_SIGNING_KEY;
if (!key || !/^[0-9a-f]{64}$/.test(key))
  throw new Error('Set a 64-character lowercase hex QUOTATION_SIGNING_KEY.');
psql(
  [],
  `begin;insert into private.quotation_signing_keys(singleton,secret_hex) values(true,'${key}') on conflict(singleton) do update set secret_hex=excluded.secret_hex;commit;`,
);
console.log(
  'Quotation signing key configured. Existing outstanding proofs are invalidated.',
);
