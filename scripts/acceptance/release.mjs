import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { AcceptanceError } from './http.mjs';

export const releaseCandidate = 'rc/2026-10-05-phase11d.3';
export const operatorId = (v) => /^[a-z0-9][a-z0-9._-]{1,63}$/.test(v ?? '');

export function assertReleaseIdentity({ commit, dirty, target, env }) {
  if (!/^[a-f0-9]{40}$/.test(commit ?? '') || target.releaseSha !== commit)
    throw new AcceptanceError(
      'RELEASE_COMMIT_MISMATCH',
      'CONFIGURATION_FAILURE',
    );
  if (target.releaseCandidate !== releaseCandidate)
    throw new AcceptanceError(
      'RELEASE_CANDIDATE_MISMATCH',
      'CONFIGURATION_FAILURE',
    );
  if (dirty)
    throw new AcceptanceError('RELEASE_SOURCE_DIRTY', 'CONFIGURATION_FAILURE');
  if (
    !operatorId(env.ACCEPTANCE_TESTER_ID) ||
    !operatorId(env.ACCEPTANCE_RELEASE_OWNER_ID)
  )
    throw new AcceptanceError(
      'RELEASE_OWNERSHIP_REQUIRED',
      'CONFIGURATION_FAILURE',
    );
  return {
    releaseCandidate,
    releaseSha: commit,
    testerId: env.ACCEPTANCE_TESTER_ID,
    releaseOwnerId: env.ACCEPTANCE_RELEASE_OWNER_ID,
  };
}

// No inherited provider credentials, shell interpolation or network operation.
export function verifyRelease(env, target, cwd = process.cwd()) {
  const childEnv = Object.fromEntries(
    Object.entries(process.env).filter(([name]) =>
      [
        'PATH',
        'Path',
        'PATHEXT',
        'SystemRoot',
        'SYSTEMROOT',
        'WINDIR',
        'HOME',
        'USERPROFILE',
      ].includes(name),
    ),
  );
  const git = (args) => {
    const result = spawnSync('git', args, {
      cwd,
      env: childEnv,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 10000,
    });
    if (result.status !== 0 || result.error)
      throw new AcceptanceError(
        'RELEASE_CHECKOUT_UNAVAILABLE',
        'CONFIGURATION_FAILURE',
      );
    return result.stdout.trim();
  };
  const commit = git(['rev-parse', 'HEAD']);
  // Generated legacy PDF previews and sanitized evidence are not source inputs.
  // Every tracked file, including docs, must match the tested commit.
  const trackedDirty = git(['diff', '--name-only', 'HEAD']).length > 0;
  const untracked = git(['ls-files', '--others', '--exclude-standard'])
    .split('\n')
    .filter(Boolean)
    .filter(
      (path) =>
        !path.startsWith('output/') &&
        !path.startsWith('docs/release-evidence/'),
    );
  // Ensure the source contains its dependency lockfile rather than a loose copy.
  readFileSync(`${cwd}/pnpm-lock.yaml`);
  return assertReleaseIdentity({
    commit,
    dirty: trackedDirty || untracked.length > 0,
    target,
    env,
  });
}
