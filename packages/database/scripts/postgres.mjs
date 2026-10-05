import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertLocalTestDatabase } from '../../../scripts/local-test-target.ts';

export function psql(args, input) {
  const bin =
    process.env.PSQL_PATH ||
    (process.platform === 'win32'
      ? 'C:/Program Files/PostgreSQL/18/bin/psql.exe'
      : 'psql');
  const url = process.env.TEST_DATABASE_URL;
  if (!url)
    throw new Error(
      'Set TEST_DATABASE_URL to an isolated disposable database. Never use a production database.',
    );
  assertLocalTestDatabase(url);
  const result = spawnSync(
    bin,
    ['-X', '-v', 'ON_ERROR_STOP=1', '-d', url, ...args],
    { input, encoding: 'utf8', env: process.env },
  );
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      result.stderr || result.stdout || 'PostgreSQL command failed',
    );
  if (result.stderr) process.stderr.write(result.stderr);
  return result.stdout.trim();
}
export const databaseRoot = new URL('../', import.meta.url);
export function file(relative) {
  return join(fileURLToPath(databaseRoot), relative);
}
export function ensureTooling() {
  if (!existsSync(file('supabase/migrations')))
    throw new Error('Missing migrations');
}
