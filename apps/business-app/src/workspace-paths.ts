/**
 * Pure ingress planner. The configured central host may change without
 * changing any tenant identifiers or stored custom domain records.
 * IMPORTANT: scope headers must be removed before routing to the application.
 */
export const WORKSPACE_SLUG_HEADER = 'x-business-os-workspace-slug';
export const WORKSPACE_HOST_HEADER = 'x-business-os-workspace-host';
export const WORKSPACE_COOKIE = 'business-os-workspace-route';

const RESERVED = new Set([
  'admin', 'api', 'auth', 'dashboard', 'login', 'register', 'forgot-password',
  'reset-password', 'q', 'assets', 'brochure', 'favicon.ico', '_next',
]);

export function validWorkspaceSlug(value: string) {
  return (
    value.length > 0 &&
    value.length <= 80 &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) &&
    !RESERVED.has(value)
  );
}

export function normalizedWorkspaceHost(host: string) {
  const value = host.trim().toLowerCase().replace(/:\d{1,5}$/, '');
  return value.length <= 253 &&
    /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(value)
    ? value
    : null;
}

export type WorkspaceIngress = {
  scope: { type: 'slug' | 'hostname'; value: string } | null;
  rewrite: string | null;
  redirect: string | null;
  setSlugCookie: string | null;
  denyPlatform: boolean;
};

export function workspaceIngress(input: {
  host: string;
  pathname: string;
  selectedSlug: string | null;
  centralHosts: readonly string[];
  enabled: boolean;
  method: string;
}): WorkspaceIngress {
  const none: WorkspaceIngress = {
    scope: null,
    rewrite: null,
    redirect: null,
    setSlugCookie: null,
    denyPlatform: false,
  };
  if (!input.enabled) return none;
  const host = normalizedWorkspaceHost(input.host);
  if (!host) return { ...none, denyPlatform: true };
  const central = input.centralHosts.some(
    (name) => normalizedWorkspaceHost(name) === host,
  );
  const path = input.pathname;
  const dashboard = path === '/dashboard' || path.startsWith('/dashboard/');
  const slugMatch = central
    ? /^\/([a-z0-9-]{1,80})(\/dashboard(?:\/.*)?)$/.exec(path)
    : null;
  if (slugMatch && validWorkspaceSlug(slugMatch[1]!)) {
    return {
      ...none,
      scope: { type: 'slug', value: slugMatch[1]! },
      rewrite: slugMatch[2]!,
      setSlugCookie: slugMatch[1]!,
    };
  }
  if (central && dashboard && input.selectedSlug &&
      validWorkspaceSlug(input.selectedSlug)) {
    const redirect = '/' + input.selectedSlug + path;
    return {
      ...none,
      scope: { type: 'slug', value: input.selectedSlug },
      // Non-GET requests include Server Action submissions: do not redirect
      // these because redirects would forward the action body to a new path.
      redirect: input.method === 'GET' || input.method === 'HEAD'
        ? redirect : null,
    };
  }
  if (central && dashboard && !validWorkspaceSlug(input.selectedSlug ?? '') &&
      path !== '/dashboard') {
    // New sessions must select/resolve the company on the dashboard landing
    // page instead of silently serving a module for the first membership.
    return {
      ...none,
      redirect: input.method === 'GET' || input.method === 'HEAD'
        ? '/dashboard' : null,
      denyPlatform: input.method !== 'GET' && input.method !== 'HEAD',
    };
  }
  if (!central) {
    if (path === '/admin' || path.startsWith('/admin/')) {
      return { ...none, denyPlatform: true };
    }
    if (dashboard) {
      return {
        ...none,
        scope: { type: 'hostname', value: host },
      };
    }
  }
  return none;
}
