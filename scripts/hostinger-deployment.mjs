import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const deploymentIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

/**
 * Compute ONE deployment identity for this exact build.
 * This is non-secret, embedded in Next.js assets for client/server skew
 * detection. It must change when a new build is rolled out.
 */
export function resolveDeploymentId({
  env = process.env,
  cwd = process.cwd(),
  gitCommit = null,
  random = () => randomBytes(12).toString('hex'),
} = {}) {
  const provided = env.NEXT_DEPLOYMENT_ID?.trim();
  if (provided) {
    if (!deploymentIdPattern.test(provided)) {
      throw new Error(
        'NEXT_DEPLOYMENT_ID must be a non-secret 1-80 character deployment identifier.',
      );
    }
    return provided;
  }
  let commit = gitCommit;
  if (commit === null) {
    try {
      commit = execFileSync('git', ['rev-parse', '--verify', 'HEAD'], {
        cwd,
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      commit = '';
    }
  }
  // Rebuilds of a commit can differ when secrets, dependencies or tool
  // versions change. Include a per-build suffix to prevent stale actions.
  const revision = /^[a-f0-9]{40}$/i.test(commit ?? '')
    ? commit.slice(0, 12)
    : 'unknown';
  return 'business-os-' + revision + '-' + random();
}

/**
 * Next.js embeds this server-only AES key in the build.
 * Validate its encoding without printing or returning key material.
 * The same value must also be present at runtime for multi-instance hosting.
 */
export function validateServerActionsEncryptionKey(env = process.env) {
  const key = env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY?.trim();
  if (!key) return false;
  const decoded = Buffer.from(key, 'base64');
  if (decoded.length !== 32 || decoded.toString('base64') !== key) {
    throw new Error(
      'NEXT_SERVER_ACTIONS_ENCRYPTION_KEY must be a canonical base64-encoded 32-byte key.',
    );
  }
  return true;
}
