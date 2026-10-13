import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import {
  buildClientAssetManifest,
  checkClientAssetsAtStartup,
  verifyClientAssets,
} from './client-asset-integrity.mjs';

test('client chunks are parsed, hashed and verified before Hostinger starts', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'business-os-assets-'));
  try {
    const chunkDir = join(temp, '.next', 'static', 'chunks');
    mkdirSync(chunkDir, { recursive: true });
    const script = join(chunkDir, 'test-abc123.js');
    writeFileSync(script, 'globalThis.__testAsset = 1;\n');
    const grouped = join(chunkDir, 'app', '(owner)');
    mkdirSync(grouped, { recursive: true });
    writeFileSync(
      join(grouped, '[lead]-chunk.js'),
      'globalThis.__routeChunk = true;\n',
    );
    assert.equal(await buildClientAssetManifest(temp), 2);
    assert.equal(verifyClientAssets(temp), 2);
    const manifest = JSON.parse(
      readFileSync(join(temp, '.next', 'client-asset-integrity.json'), 'utf8'),
    );
    assert.equal(manifest.files['static/chunks/test-abc123.js'].bytes, 28);
    writeFileSync(script, 'globalThis.__testAsset =');
    assert.throws(() => verifyClientAssets(temp), /truncated or modified/);
    await assert.rejects(
      () => buildClientAssetManifest(temp),
      /invalid or truncated syntax/,
    );
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('Hostinger require(esm) can synchronously load the asset helper', () => {
  // Hostinger's lsnode.js require(esm) startup fails if the imported
  // module graph contains top-level await, even behind an unentered if.
  const require = createRequire(import.meta.url);
  const helper = require('./client-asset-integrity.mjs');
  assert.equal(typeof helper.verifyClientAssets, 'function');
  assert.equal(typeof helper.checkClientAssetsAtStartup, 'function');
});

test('missing asset manifest does not stop Next.js startup', () => {
  const temp = mkdtempSync(join(tmpdir(), 'business-os-missing-asset-'));
  try {
    const notices = [];
    const result = checkClientAssetsAtStartup(temp, (message) =>
      notices.push(message),
    );
    assert.deepEqual(result, { ok: false, count: 0 });
    assert.match(notices.join(' '), /startup continues/);
    assert.throws(() => verifyClientAssets(temp), /manifest missing/);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
