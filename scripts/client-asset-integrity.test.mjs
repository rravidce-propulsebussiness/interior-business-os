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
import { join } from 'node:path';
import {
  buildClientAssetManifest,
  verifyClientAssets,
} from './client-asset-integrity.mjs';

test('client chunks are parsed, hashed and verified before Hostinger starts', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'business-os-assets-'));
  try {
    const chunkDir = join(temp, '.next', 'static', 'chunks');
    mkdirSync(chunkDir, { recursive: true });
    const script = join(chunkDir, 'test-abc123.js');
    writeFileSync(script, 'globalThis.__testAsset = 1;\n');
    assert.equal(await buildClientAssetManifest(temp), 1);
    assert.equal(verifyClientAssets(temp), 1);
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
