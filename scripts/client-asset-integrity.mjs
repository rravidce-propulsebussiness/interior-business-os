import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const manifestName = 'client-asset-integrity.json';

function walk(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const name = join(path, entry.name);
    return entry.isDirectory() ? walk(name) : [name];
  });
}

function checksum(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

export function verifyClientAssets(appDir) {
  const root = resolve(appDir, '.next');
  const manifestPath = join(root, manifestName);
  if (!existsSync(manifestPath))
    throw new Error(
      'Client asset integrity manifest missing. Rebuild and republish the full Next.js output.',
    );
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (
    manifest.version !== 1 ||
    !manifest.files ||
    !Object.keys(manifest.files).length
  )
    throw new Error('Invalid client asset integrity manifest.');
  for (const [name, expected] of Object.entries(manifest.files)) {
    // App Router route-group chunk names legitimately include parentheses
    // and square brackets. Reject path traversal without banning those.
    if (
      !name.startsWith('static/chunks/') ||
      !name.endsWith('.js') ||
      name.includes('\\') ||
      name
        .split('/')
        .some((segment) => !segment || segment === '.' || segment === '..')
    )
      throw new Error('Invalid client asset manifest path');
    const file = resolve(root, name);
    if (!existsSync(file))
      throw new Error('Published Next.js JavaScript chunk missing: ' + name);
    const data = readFileSync(file);
    if (data.length !== expected.bytes || checksum(data) !== expected.sha256)
      throw new Error(
        'Published Next.js JavaScript chunk truncated or modified: ' + name,
      );
  }
  return Object.keys(manifest.files).length;
}

export async function buildClientAssetManifest(appDir) {
  const root = resolve(appDir, '.next');
  const chunkDir = join(root, 'static', 'chunks');
  if (!existsSync(chunkDir))
    throw new Error('Next.js client chunk directory not found.');
  // esbuild's parser catches an unexpected end-of-input at BUILD TIME, before
  // Hostinger serves the file and a user gets a blank CRM.
  const { transformSync } = await import('esbuild');
  const files = {};
  for (const file of walk(chunkDir)
    .filter((x) => x.endsWith('.js'))
    .sort()) {
    const content = readFileSync(file);
    if (content.length < 5) throw new Error('Empty JavaScript chunk: ' + file);
    try {
      transformSync(content.toString('utf8'), {
        loader: 'js',
        target: 'esnext',
      });
    } catch {
      throw new Error(
        'Generated JavaScript chunk has invalid or truncated syntax: ' +
          relative(root, file),
      );
    }
    files[relative(root, file).split('\\').join('/')] = {
      bytes: content.length,
      sha256: checksum(content),
    };
  }
  if (!Object.keys(files).length)
    throw new Error('Next.js did not produce JavaScript chunks.');
  writeFileSync(
    join(root, manifestName),
    JSON.stringify({ version: 1, files }) + '\n',
  );
  return Object.keys(files).length;
}

/**
 * Runtime check is advisory: a stale or partially published asset must be
 * reported, but cannot prevent Next.js from starting for every route.
 * The build step remains strict and fails before producing a release.
 */
export function checkClientAssetsAtStartup(appDir, log = console.warn) {
  try {
    return { ok: true, count: verifyClientAssets(appDir) };
  } catch (error) {
    log(
      '[Business OS] Client asset integrity warning; Next.js startup continues: ' +
        (error instanceof Error ? error.message : 'Unknown asset integrity failure'),
    );
    return { ok: false, count: 0 };
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const service = process.argv[2] || 'business-app';
  if (!['business-app', 'platform-admin', 'websites'].includes(service))
    throw new Error('Invalid Next.js service for chunk verification');
  const appDir = resolve(
    fileURLToPath(new URL('..', import.meta.url)),
    'apps',
    service,
  );
  // Hostinger loads server.js through require(esm). A top-level await ANYWHERE
  // in its transitive ESM imports makes require(esm) fail with
  // ERR_REQUIRE_ASYNC_MODULE, resulting in a site-wide 503. Keep this entry
  // point asynchronous only when the tool is executed directly, not imported.
  const work = process.argv.includes('--build')
    ? buildClientAssetManifest(appDir)
    : Promise.resolve().then(() => verifyClientAssets(appDir));
  work
    .then((count) => {
      console.log('Verified ' + count + ' Next.js client chunks for ' + service);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : 'Client asset verification failed.');
      process.exitCode = 1;
    });
}
