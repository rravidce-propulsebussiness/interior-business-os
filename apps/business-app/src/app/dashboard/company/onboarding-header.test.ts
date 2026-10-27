import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = (relative: string) =>
  readFileSync(new URL(relative, import.meta.url), 'utf8');

describe('onboarding header', () => {
  const header = source('./onboarding-header.tsx');
  const invitations = source('./invitations/page.tsx');
  const registration = source('./apply/page.tsx');
  const welcome = source('../no-company-workspace.tsx');

  it('provides homepage navigation and real server-side sign-out', () => {
    expect(header).toContain(
      "import { signOut } from '@business-os/auth/actions'",
    );
    expect(header).toContain('href="/"');
    expect(header).toContain('<form action={signOut}');
    expect(header).toContain('type="submit"');
    expect(header).toContain('Home');
    expect(header).toContain('Log out');
    expect(header).not.toContain('href="/dashboard"');
  });

  it('replaces the obsolete dashboard back link on both entry forms', () => {
    for (const page of [invitations, registration]) {
      expect(page).toContain('<WorkspaceOnboardingHeader />');
      expect(page).not.toContain('← Business dashboard');
    }
    expect(welcome).toContain('<WorkspaceOnboardingHeader />');
    expect(welcome).not.toContain('Back to website');
  });
});
