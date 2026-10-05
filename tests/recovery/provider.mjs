// Local protocol fixture only. Never part of the application or a hosted acceptance claim.
import http from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
if (
  process.env.APP_ENV !== 'development' ||
  (process.env.RECOVERY_FIXTURE_TOKEN ?? '').length < 32
)
  throw new Error(
    'Local recovery fixture requires its private development control token',
  );
const port = Number(process.env.RECOVERY_FIXTURE_PORT);
const control = process.env.RECOVERY_FIXTURE_TOKEN;
const publicKey = 'sb_publishable_local_recovery_fixture';
const users = new Map(),
  tokens = new Map(),
  access = new Map(),
  refresh = new Map();
let mails = [],
  events = [],
  mode = 'healthy',
  requests = new Map();
function reset() {
  users.clear();
  tokens.clear();
  access.clear();
  refresh.clear();
  mails = [];
  events = [];
  mode = 'healthy';
  requests = new Map();
  users.set('owner@example.test', {
    id: '00000000-0000-4000-8000-000000001101',
    email: 'owner@example.test',
    password: 'Initial-local-password-123',
  });
  users.set('other@example.test', {
    id: '00000000-0000-4000-8000-000000001102',
    email: 'other@example.test',
    password: 'Other-local-password-123',
  });
}
reset();
const json = (response, status, value) => {
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(value));
};
const view = (user) => ({
  id: user.id,
  aud: 'authenticated',
  role: 'authenticated',
  email: user.email,
  email_confirmed_at: new Date().toISOString(),
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {},
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});
function session(user, expired = false) {
  const expiresAt = Math.floor(Date.now() / 1000) + (expired ? -1 : 3600);
  const jwt = [
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
      'base64url',
    ),
    Buffer.from(
      JSON.stringify({
        sub: user.id,
        aud: 'authenticated',
        role: 'authenticated',
        exp: expiresAt,
        session_id: randomUUID(),
      }),
    ).toString('base64url'),
    randomBytes(32).toString('base64url'),
  ].join('.');
  const r = randomBytes(32).toString('hex');
  access.set(jwt, { user, expiresAt });
  refresh.set(r, user);
  return {
    access_token: jwt,
    refresh_token: r,
    expires_in: expired ? -1 : 3600,
    expires_at: expiresAt,
    token_type: 'bearer',
    user: view(user),
  };
}
function issue(email, origin, expired = false, purpose = 'recovery') {
  const token = randomBytes(32).toString('hex');
  tokens.set(token, {
    user: users.get(email),
    used: false,
    expiresAt: Date.now() + (expired ? -1 : 3600000),
    purpose,
  });
  return {
    link: `${new URL(origin).origin}/auth/recovery?token_hash=${token}&type=recovery`,
    token,
  };
}
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://127.0.0.1:${port}`);
    let raw = '';
    for await (const chunk of request) {
      raw += chunk;
      if (raw.length > 16384) return json(response, 413, {});
    }
    const body = raw ? JSON.parse(raw) : {};
    if (url.pathname.startsWith('/control/')) {
      if (request.headers.authorization !== `Bearer ${control}`)
        return json(response, 401, {});
      if (url.pathname === '/control/reset') {
        reset();
        return json(response, 200, {});
      }
      if (url.pathname === '/control/expire') {
        for (const value of access.values()) value.expiresAt = 0;
        refresh.clear();
        return json(response, 200, {});
      }
      if (url.pathname === '/control/mode') {
        mode = body.mode;
        return json(response, 200, {});
      }
      if (url.pathname === '/control/mail') return json(response, 200, mails);
      if (url.pathname === '/control/issue')
        return json(
          response,
          200,
          issue(
            body.email ?? 'owner@example.test',
            body.origin,
            body.expired,
            body.purpose,
          ),
        );
      if (url.pathname === '/control/state')
        return json(response, 200, {
          events,
          tokens: [...tokens.values()].map((t) => ({ used: t.used })),
          refreshSessions: refresh.size,
        });
      return json(response, 404, {});
    }
    if (url.pathname === '/health')
      return json(response, 200, { fixture: true });
    if (request.headers.apikey !== publicKey)
      return json(response, 401, { msg: 'Invalid fixture public key' });
    const bearer = (request.headers.authorization ?? '').replace(
      /^Bearer /,
      '',
    );
    const current = access.get(bearer);
    const authenticated = current && current.expiresAt > Date.now() / 1000;
    if (url.pathname === '/auth/v1/recover') {
      events.push({ kind: 'request' });
      if (mode === 'unavailable')
        return json(response, 503, { msg: 'Fixture unavailable' });
      const previous = requests.get(body.email) ?? 0;
      if (Date.now() - previous < 60000 || mode === 'limited')
        return json(response, 429, { msg: 'Fixture rate limit' });
      requests.set(body.email, Date.now());
      if (users.has(body.email))
        mails.push(issue(body.email, url.searchParams.get('redirect_to')));
      return json(response, 200, {});
    }
    if (url.pathname === '/auth/v1/verify') {
      const record = tokens.get(body.token_hash);
      if (
        !record?.user ||
        record.used ||
        record.expiresAt <= Date.now() ||
        record.purpose !== body.type ||
        body.type !== 'recovery'
      )
        return json(response, 403, {
          msg: 'Invalid fixture recovery link',
          error_code: 'otp_expired',
        });
      record.used = true;
      events.push({ kind: 'verify', userId: record.user.id });
      return json(response, 200, session(record.user));
    }
    if (url.pathname === '/auth/v1/token') {
      if (url.searchParams.get('grant_type') === 'refresh_token') {
        const user = refresh.get(body.refresh_token);
        return user
          ? json(response, 200, session(user))
          : json(response, 400, { msg: 'Invalid fixture refresh session' });
      }
      const user = users.get(body.email);
      if (!user || user.password !== body.password)
        return json(response, 400, {
          msg: 'Invalid fixture credentials',
          error_code: 'invalid_credentials',
        });
      events.push({ kind: 'login', userId: user.id });
      return json(response, 200, session(user));
    }
    if (url.pathname === '/auth/v1/user') {
      if (!authenticated)
        return json(response, 401, { msg: 'Fixture session unavailable' });
      if (request.method === 'PUT') {
        if (
          typeof body.password !== 'string' ||
          body.password.length < 12 ||
          Object.keys(body).some(
            (k) =>
              !['password', 'code_challenge', 'code_challenge_method'].includes(
                k,
              ),
          ) ||
          body.code_challenge != null ||
          body.code_challenge_method != null
        )
          return json(response, 400, { msg: 'Fixture validation failed' });
        current.user.password = body.password;
        events.push({ kind: 'password', userId: current.user.id });
      }
      return json(response, 200, view(current.user));
    }
    if (url.pathname === '/auth/v1/logout') {
      if (!authenticated)
        return json(response, 401, { msg: 'Fixture session unavailable' });
      if (mode === 'logout_failure')
        return json(response, 503, { msg: 'Fixture revocation unavailable' });
      for (const [value, user] of refresh)
        if (user.id === current.user.id) refresh.delete(value);
      events.push({
        kind: 'logout',
        scope: url.searchParams.get('scope'),
        userId: current.user.id,
      });
      return json(response, 200, {});
    }
    if (url.pathname.startsWith('/rest/v1/')) {
      if (!authenticated) return json(response, 401, {});
      if (url.pathname === '/rest/v1/rpc/platform_context')
        return json(response, 200, {
          userId: current.user.id,
          roles: ['fixture-platform'],
          permissions: [
            'platform.access',
            'platform.organizations.view',
            'platform.catalog.view',
          ],
        });
      return json(response, 200, []); // Empty memberships: never implies tenant access.
    }
    return json(response, 404, {});
  } catch {
    return json(response, 500, { msg: 'Fixture operation failed' });
  }
});
server.listen(port, '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => server.close(() => process.exit(0)));
