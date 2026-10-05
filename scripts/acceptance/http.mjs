export class AcceptanceError extends Error {
  constructor(code, category = 'CODE_FAILURE', evidence = {}) {
    if (
      !/^[A-Z0-9_]+$/.test(code) ||
      ![
        'CODE_FAILURE',
        'CONFIGURATION_FAILURE',
        'EXTERNAL_DEPENDENCY',
        'MISSING_CREDENTIAL',
        'ENVIRONMENT_LIMITATION',
      ].includes(category)
    )
      throw new Error('INVALID_FAILURE_CODE');
    super(code);
    this.category = category;
    this.evidence = evidence;
  }
}
export async function request(url, options = {}) {
  try {
    const response = await fetch(url, {
      ...options,
      redirect: 'manual',
      signal: AbortSignal.timeout(30000),
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    const text = buffer.toString('utf8');
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
    return {
      status: response.status,
      headers: response.headers,
      body,
      text,
      buffer,
    };
  } catch {
    throw new AcceptanceError('REMOTE_REQUEST_FAILED', 'EXTERNAL_DEPENDENCY');
  }
}
export class Supabase {
  constructor(env) {
    this.env = env;
    this.sessions = new Map();
  }
  async call(path, { actor = 'anonymous', method = 'GET', body } = {}) {
    const session = this.sessions.get(actor);
    if (actor !== 'anonymous' && !session)
      throw new AcceptanceError(
        'IDENTITY_NOT_AUTHENTICATED',
        'CONFIGURATION_FAILURE',
      );
    return request(new URL(path, this.env.HOSTED_SUPABASE_URL), {
      method,
      headers: {
        apikey: this.env.HOSTED_SUPABASE_PUBLISHABLE_KEY,
        ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }
  async login(actor) {
    const r = await this.call('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: {
        email: this.env[`ACCEPTANCE_${actor}_EMAIL`],
        password: this.env[`ACCEPTANCE_${actor}_PASSWORD`],
      },
    });
    if (
      r.status !== 200 ||
      !r.body?.access_token ||
      !r.body?.refresh_token ||
      !r.body?.user?.id
    )
      throw new AcceptanceError('LOGIN_REJECTED', 'CONFIGURATION_FAILURE', {
        httpStatus: r.status,
      });
    this.sessions.set(actor, r.body);
    return r.body;
  }
  async rpc(actor, name, body) {
    return this.call(`/rest/v1/rpc/${name}`, { actor, method: 'POST', body });
  }
  async logoutAll() {
    for (const actor of this.sessions.keys()) {
      const r = await this.call('/auth/v1/logout?scope=local', {
        actor,
        method: 'POST',
      });
      if (r.status !== 204)
        throw new AcceptanceError(
          'SESSION_CLEANUP_FAILED',
          'EXTERNAL_DEPENDENCY',
          { httpStatus: r.status },
        );
      this.sessions.delete(actor);
    }
  }
}
export function assert(value, code, evidence = {}) {
  if (!value) throw new AcceptanceError(code, 'CODE_FAILURE', evidence);
}
