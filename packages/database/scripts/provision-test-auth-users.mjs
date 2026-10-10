/**
 * Create the five disposable Auth identities expected by seed-users.sql.
 * Run locally only against an explicitly identified non-production Supabase project.
 * Requires a server-only Supabase secret key; NEVER deploy this script as an API route.
 *
 * Environment:
 *   ALLOW_TEST_AUTH_PROVISIONING=yes
 *   APP_ENV=staging (or development)
 *   SUPABASE_ENVIRONMENT=staging (or development)
 *   BUSINESS_OS_TEST_PROJECT_REF=<project-ref>
 *   SUPABASE_URL=https://<project-ref>.supabase.co
 *   SUPABASE_SECRET_KEY=<server-only secret key>
 *
 * After creating the identities, run packages/database/supabase/seed-users.sql
 * through the Supabase SQL editor (after seed.sql) to assign the test roles.
 */
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const accounts = [
  {
    email: 'platform.admin@example.test',
    fullName: 'Test Platform Admin',
    role: 'platform_super_admin',
  },
  {
    email: 'owner@example.test',
    fullName: 'Test Business Owner',
    role: 'owner',
  },
  {
    email: 'sales@example.test',
    fullName: 'Test Sales Executive',
    role: 'sales',
  },
  {
    email: 'designer@example.test',
    fullName: 'Test Interior Designer',
    role: 'interior_designer',
  },
  {
    email: 'accountant@example.test',
    fullName: 'Test Accountant',
    role: 'accountant',
  },
];

function fail(message) {
  throw new Error(message);
}
const appEnv = process.env.APP_ENV;
const dbEnv = process.env.SUPABASE_ENVIRONMENT;
if (process.env.ALLOW_TEST_AUTH_PROVISIONING !== 'yes')
  fail('Set ALLOW_TEST_AUTH_PROVISIONING=yes to explicitly opt in.');
if (
  !['development', 'staging'].includes(appEnv) ||
  !['development', 'staging'].includes(dbEnv)
)
  fail('Both APP_ENV and SUPABASE_ENVIRONMENT must be development or staging.');
const supabaseUrl = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const expectedRef = process.env.BUSINESS_OS_TEST_PROJECT_REF;
if (!supabaseUrl || !secretKey || !expectedRef)
  fail(
    'SUPABASE_URL, SUPABASE_SECRET_KEY and BUSINESS_OS_TEST_PROJECT_REF are required.',
  );
const url = new URL(supabaseUrl);
if (url.protocol !== 'https:' || url.hostname !== `${expectedRef}.supabase.co`)
  fail(
    'SUPABASE_URL must match the explicitly selected test project reference.',
  );
if (!/^[a-z0-9]{12,30}$/.test(expectedRef))
  fail('Invalid test project reference.');
if (!secretKey.startsWith('sb_secret_') && !secretKey.startsWith('eyJ'))
  fail(
    'Supply a Supabase secret key or legacy service-role key, never the public key.',
  );

const auth = createClient(supabaseUrl, secretKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});
const credentialsFile = resolve(
  process.cwd(),
  '.tools',
  'business-os-test-users.json',
);
let saved = { projectRef: expectedRef, accounts: [] };
try {
  const prior = JSON.parse(await readFile(credentialsFile, 'utf8'));
  if (prior.projectRef !== expectedRef)
    fail(
      'Existing local credentials belong to a different Supabase project; move that file first.',
    );
  saved = prior;
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const existingByEmail = new Map();
for (let page = 1; page <= 20; page++) {
  const { data, error } = await auth.auth.admin.listUsers({
    page,
    perPage: 1000,
  });
  if (error) fail(`Cannot list test Auth users: ${error.message}`);
  for (const user of data.users)
    existingByEmail.set(user.email?.toLowerCase(), user.id);
  if (data.users.length < 1000) break;
}
let created = 0;
for (const spec of accounts) {
  if (existingByEmail.has(spec.email)) {
    console.log(`Existing, left unchanged: ${spec.email}`);
    continue;
  }
  const password = randomBytes(24).toString('base64url') + 'aA!9';
  const { data, error } = await auth.auth.admin.createUser({
    email: spec.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: spec.fullName },
  });
  if (error || !data.user)
    fail(`Failed creating ${spec.email}: ${error?.message ?? 'Unknown error'}`);
  saved.accounts.push({
    email: spec.email,
    password,
    role: spec.role,
    userId: data.user.id,
  });
  await mkdir(resolve(process.cwd(), '.tools'), { recursive: true });
  await writeFile(credentialsFile, JSON.stringify(saved, null, 2) + '\n', {
    mode: 0o600,
  });
  existingByEmail.set(spec.email, data.user.id);
  created++;
  console.log(`Created: ${spec.email}`);
}
console.log(
  `Created ${created} new test Auth user(s). Account passwords are in the local ignored file: ${credentialsFile}`,
);
console.log(
  'NEXT STEP: execute packages/database/supabase/seed-users.sql in the selected test Supabase project.',
);
console.log(
  'Do not commit or share the credentials JSON. Do not run the development seed on production.',
);
