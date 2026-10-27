import { describe, expect, it } from 'vitest';
import { chooseLoginDestination } from './login-destination-policy';

describe('Business OS shared login destination', () => {
  it('sends a homeowner with a shared project to the Client App', () => {
    expect(
      chooseLoginDestination({
        hasActiveCompanyMembership: false,
        hasSharedClientProjects: true,
      }),
    ).toBe('/client');
  });
  it('keeps business owners and employees in their dashboard', () => {
    expect(
      chooseLoginDestination({
        hasActiveCompanyMembership: true,
        hasSharedClientProjects: false,
      }),
    ).toBe('/dashboard');
  });
  it('prefers business workspaces for people with both roles using main login', () => {
    expect(
      chooseLoginDestination({
        hasActiveCompanyMembership: true,
        hasSharedClientProjects: true,
      }),
    ).toBe('/dashboard');
  });
  it('lets a dual-role user explicitly enter their shared client portal', () => {
    expect(
      chooseLoginDestination({
        hasActiveCompanyMembership: true,
        hasSharedClientProjects: true,
        preferClient: true,
      }),
    ).toBe('/client');
  });
  it('does not grant project access to an uninvited account', () => {
    expect(
      chooseLoginDestination({
        hasActiveCompanyMembership: false,
        hasSharedClientProjects: false,
      }),
    ).toBe('/dashboard');
    expect(
      chooseLoginDestination({
        hasActiveCompanyMembership: false,
        hasSharedClientProjects: false,
        preferClient: true,
      }),
    ).toBe('/client');
  });
});
