import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

// Values are used only for comparisons and never included in diagnostics.
const credentials = new Set();
const secretName =
  /SIGNING_KEY|SERVICE_ROLE|SECRET_KEY|DATABASE_URL|API_KEY|PASSWORD|PRIVATE_KEY|CLIENT_SECRET|SMTP_PASS|TOKEN|COOKIE|AUTHORIZATION|RESET_URL/;
const collect = (name, value) => {
  // The passwordless loopback CI database address is a fixture, not a credential.
  if (name === 'TEST_DATABASE_URL') {
    try {
      const url = new URL(value);
      if (
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
        !url.password
      )
        return;
    } catch {
      /* Invalid configuration still receives normal pattern scanning. */
    }
  }
  if (
    secretName.test(name) &&
    !name.startsWith('NEXT_PUBLIC_') &&
    value.length >= 8
  )
    credentials.add(value);
  if (/DATABASE_URL/.test(name)) {
    try {
      const password = decodeURIComponent(new URL(value).password);
      if (password.length >= 8) credentials.add(password);
    } catch {
      /* Invalid configuration is handled by deployment validation. */
    }
  }
};
for (const [name, value] of Object.entries(process.env))
  collect(name, value ?? '');
for (const directory of [
  '.',
  'apps/business-app',
  'apps/platform-admin',
  'apps/websites',
]) {
  for (const entry of readdirSync(directory)) {
    if (!/^\.env(?:\.|$)/.test(entry) || entry === '.env.example') continue;
    for (const line of readFileSync(join(directory, entry), 'utf8').split(
      /\r?\n/,
    )) {
      const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (match) collect(match[1], match[2].replace(/^['"]|['"]$/g, ''));
    }
  }
}
const excluded = new Set([
  'node_modules',
  '.git',
  '.tools',
  '.pnpm-store',
  'cache',
  'test-results',
  'playwright-report',
]);
function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (
      entry.isSymbolicLink() ||
      excluded.has(entry.name) ||
      /^\.env/.test(entry.name)
    )
      return [];
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}
const files = walk('.').filter((path) =>
  /\.(?:[cm]?js|tsx?|json|map|html|css|sql|ya?ml|md|toml|txt)$/.test(path),
);
// Sanitize and scan acceptance evidence even though other private .tools files
// (including fixture credentials and backups) remain outside source scanning.
const acceptanceRoot = join('.tools', 'acceptance');
if (existsSync(acceptanceRoot))
  for (const directory of readdirSync(acceptanceRoot, {
    withFileTypes: true,
  })) {
    if (
      !directory.isDirectory() ||
      directory.isSymbolicLink() ||
      !/^[0-9a-f-]{36}$/.test(directory.name)
    )
      continue;
    for (const name of ['results.json', 'report.md', 'browser.json']) {
      const path = join(acceptanceRoot, directory.name, name);
      if (existsSync(path)) files.push(path);
    }
  }
let count = 0;
for (const path of files) {
  const content = readFileSync(path, 'utf8');
  let found = [...credentials].some((secret) => content.includes(secret));
  found ||=
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bsb_secret_[A-Za-z0-9_-]{25,}\b|\bre_[A-Za-z0-9]{30,}\b/.test(
      content,
    );
  for (const token of content.matchAll(
    /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  )) {
    try {
      found ||=
        JSON.parse(Buffer.from(token[0].split('.')[1], 'base64url')).role ===
        'service_role';
    } catch {
      /* non-JWT text */
    }
  }
  if (found)
    throw new Error(
      `Possible embedded secret in ${relative('.', path)}; inspect privately and rotate if exposed.`,
    );
  count++;
}
for (const app of ['business-app', 'platform-admin', 'websites']) {
  if (!existsSync(`apps/${app}/.next/BUILD_ID`))
    throw new Error(`Build ${app} before artifact scanning`);
}
console.log(
  `Scanned ${count} source and artifact text files, including server/browser bundles and source maps. No configured secret values or selected credential patterns found.`,
);
