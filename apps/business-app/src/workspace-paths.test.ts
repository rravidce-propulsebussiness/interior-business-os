import { describe, expect, it } from 'vitest';
import { workspaceIngress, validWorkspaceSlug } from './workspace-paths';

const centralHosts = ['sghomesinterior.in', 'new-platform.example'];
function route(
  host: string,
  pathname: string,
  selectedSlug: string | null = null,
  method = 'GET',
) {
  return workspaceIngress({
    host,
    pathname,
    selectedSlug,
    centralHosts,
    enabled: true,
    method,
  });
}

describe('tenant workspace domain and path routing', () => {
  it('supports central company and nested module paths', () => {
    expect(route('sghomesinterior.in', '/neelima-construction/dashboard'))
      .toMatchObject({
        scope: { type: 'slug', value: 'neelima-construction' },
        rewrite: '/dashboard',
        setSlugCookie: 'neelima-construction',
      });
    expect(route('sghomesinterior.in', '/neelima-construction/dashboard/crm/leads'))
      .toMatchObject({
        scope: { type: 'slug', value: 'neelima-construction' },
        rewrite: '/dashboard/crm/leads',
      });
  });

  it('works when the configurable central hostname changes', () => {
    expect(route('new-platform.example', '/neelima-construction/dashboard'))
      .toMatchObject({
        scope: { type: 'slug', value: 'neelima-construction' },
        rewrite: '/dashboard',
      });
  });

  it('redirects ordinary dashboard links into the current central workspace', () => {
    expect(route('sghomesinterior.in', '/dashboard/quotations', 'neelima-construction'))
      .toMatchObject({
        redirect: '/neelima-construction/dashboard/quotations',
      });
    expect(route('sghomesinterior.in', '/dashboard/crm', 'neelima-construction', 'POST'))
      .toMatchObject({
        redirect: null,
        scope: { type: 'slug', value: 'neelima-construction' },
      });
  });

  it('does not permit unscoped nested dashboard requests', () => {
    expect(route('sghomesinterior.in', '/dashboard/crm')).toMatchObject({
      redirect: '/dashboard',
    });
    expect(route('sghomesinterior.in', '/dashboard/crm', null, 'POST'))
      .toMatchObject({ denyPlatform: true });
  });

  it('selects tenant by exact hostname on connected customer domains', () => {
    expect(route('neelimaconstruction.com', '/dashboard')).toMatchObject({
      scope: { type: 'hostname', value: 'neelimaconstruction.com' },
      rewrite: null,
    });
    expect(route('neelimaconstruction.com', '/dashboard/finance')).toMatchObject({
      scope: { type: 'hostname', value: 'neelimaconstruction.com' },
    });
    expect(route('neelimaconstruction.com', '/admin')).toMatchObject({
      denyPlatform: true,
    });
  });

  it('ignores session company cookie when a custom hostname fixes the tenant', () => {
    expect(route('neelimaconstruction.com', '/dashboard', 'other-business'))
      .toMatchObject({
        scope: { type: 'hostname', value: 'neelimaconstruction.com' },
      });
  });

  it('rejects reserved or malformed central slugs', () => {
    expect(validWorkspaceSlug('admin')).toBe(false);
    expect(validWorkspaceSlug('neelima-construction')).toBe(true);
    expect(validWorkspaceSlug('--oops')).toBe(false);
    expect(route('sghomesinterior.in', '/admin/dashboard')).toMatchObject({
      rewrite: null,
      scope: null,
    });
  });

  it('leaves existing business routes untouched until enabled', () => {
    expect(workspaceIngress({
      host: 'sghomesinterior.in',
      pathname: '/neelima-construction/dashboard',
      selectedSlug: null,
      centralHosts,
      enabled: false,
      method: 'GET',
    })).toMatchObject({
      scope: null, rewrite: null, redirect: null, denyPlatform: false,
    });
  });
});
