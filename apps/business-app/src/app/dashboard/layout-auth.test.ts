import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DomainError } from '@business-os/shared';

const auth = vi.hoisted(() => ({
  activeOrganization: vi.fn(),
  redirect: vi.fn(),
  navigation: vi.fn(() => []),
}));
vi.mock('@business-os/auth/server', () => auth);
vi.mock('next/navigation', () => ({ redirect: auth.redirect }));
vi.mock('./owner-workspace-navigation', () => ({
  ownerWorkspaceNavigation: auth.navigation,
}));
vi.mock('./company-navigation-provider', () => ({
  CompanyNavigationProvider: () => null,
}));
import DashboardLayout from './layout';

beforeEach(() => {
  vi.resetAllMocks();
  auth.activeOrganization.mockResolvedValue(null);
  auth.navigation.mockReturnValue([]);
});

describe('Dashboard authentication boundary', () => {
  it('preserves the sign-in redirect before loading tenant navigation', async () => {
    const redirect = new Error('NEXT_REDIRECT');
    auth.activeOrganization.mockRejectedValue(
      new DomainError('UNAUTHENTICATED'),
    );
    auth.redirect.mockImplementation(() => {
      throw redirect;
    });
    await expect(DashboardLayout({ children: null })).rejects.toBe(redirect);
    expect(auth.redirect).toHaveBeenCalledWith('/login');
    expect(auth.navigation).not.toHaveBeenCalled();
  });

  it('does not turn an auth provider outage into an anonymous workspace', async () => {
    const outage = new Error('Auth provider unavailable');
    auth.activeOrganization.mockRejectedValue(outage);
    await expect(DashboardLayout({ children: null })).rejects.toBe(outage);
    expect(auth.redirect).not.toHaveBeenCalled();
  });

  it('allows an authenticated user without a company to reach onboarding', async () => {
    await DashboardLayout({ children: null });
    expect(auth.navigation).toHaveBeenCalledWith(null);
  });

  it('preserves tenant access errors instead of hiding them', async () => {
    const forbidden = new Error('FORBIDDEN');
    auth.activeOrganization.mockRejectedValue(forbidden);
    await expect(DashboardLayout({ children: null })).rejects.toBe(forbidden);
    expect(auth.navigation).not.toHaveBeenCalled();
  });
});
