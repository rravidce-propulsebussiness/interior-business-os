/** Routing only. Access to each destination is still enforced by RLS. */
export type LoginDestination = '/dashboard' | '/client';

export function chooseLoginDestination(input: {
  hasActiveCompanyMembership: boolean;
  hasSharedClientProjects: boolean;
  preferClient?: boolean;
}): LoginDestination {
  if (input.preferClient && input.hasSharedClientProjects) return '/client';
  if (input.hasActiveCompanyMembership) return '/dashboard';
  if (input.hasSharedClientProjects) return '/client';
  // When explicitly starting from the Client App, show its helpful no-projects
  // screen instead of taking an invited homeowner to company onboarding.
  return input.preferClient ? '/client' : '/dashboard';
}
