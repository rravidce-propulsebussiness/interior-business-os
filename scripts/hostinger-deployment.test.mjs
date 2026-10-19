import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  resolveDeploymentId,
  validateServerActionsEncryptionKey,
} from './hostinger-deployment.mjs';

test('deployment ID is unique for each build of the same commit', () => {
  const gitCommit = 'abcdef0123456789abcdef0123456789abcdef01';
  const first = resolveDeploymentId({
    env: {},
    gitCommit,
    random: () => '11112222',
  });
  const second = resolveDeploymentId({
    env: {},
    gitCommit,
    random: () => '33334444',
  });
  assert.equal(first, 'business-os-abcdef012345-11112222');
  assert.notEqual(first, second);
});

test('explicit release ID is accepted but malformed IDs are rejected', () => {
  assert.equal(
    resolveDeploymentId({ env: { NEXT_DEPLOYMENT_ID: 'release-123.ab' } }),
    'release-123.ab',
  );
  assert.throws(
    () =>
      resolveDeploymentId({ env: { NEXT_DEPLOYMENT_ID: 'a header\\r\\n' } }),
    /NEXT_DEPLOYMENT_ID/,
  );
});

test('build still receives a unique version without git metadata', () => {
  assert.equal(
    resolveDeploymentId({ env: {}, gitCommit: '', random: () => '1234' }),
    'business-os-unknown-1234',
  );
});

test('Server Action key validation is optional and never exposes key contents', () => {
  assert.equal(validateServerActionsEncryptionKey({}), false);
  const secret = randomBytes(32).toString('base64');
  assert.equal(
    validateServerActionsEncryptionKey({
      NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: secret,
    }),
    true,
  );
  assert.throws(
    () =>
      validateServerActionsEncryptionKey({
        NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: 'not-a-valid-key',
      }),
    (error) =>
      error instanceof Error &&
      /NEXT_SERVER_ACTIONS_ENCRYPTION_KEY/.test(error.message) &&
      !error.message.includes('not-a-valid-key'),
  );
});

test('Hostinger builds bound both Next.js and Rust worker concurrency', () => {
  const nextConfig = readFileSync(
    new URL('../apps/business-app/next.config.ts', import.meta.url), 'utf8',
  );
  const buildScript = readFileSync(
    new URL('./hostinger-build.mjs', import.meta.url), 'utf8',
  );
  assert.match(nextConfig, /BUSINESS_OS_HOSTED_BUILD === '1'/);
  assert.match(nextConfig, /cpus: 2/);
  assert.match(nextConfig, /staticGenerationMaxConcurrency: 2/);
  assert.match(buildScript, /BUSINESS_OS_HOSTED_BUILD: '1'/);
  assert.match(buildScript, /TOKIO_WORKER_THREADS: '2'/);
  assert.match(buildScript, /RAYON_NUM_THREADS: '2'/);
});
