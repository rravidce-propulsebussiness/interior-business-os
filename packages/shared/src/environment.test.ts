import { expect, it } from 'vitest';
import { parsePublicEnvironment } from './index';
it('rejects missing configuration and invalid URLs', () => {
  expect(() => parsePublicEnvironment({})).toThrow();
  expect(() =>
    parsePublicEnvironment({
      NEXT_PUBLIC_SUPABASE_URL: 'invalid',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'key',
    }),
  ).toThrow();
});
it('excludes server credentials from public configuration', () => {
  expect(
    parsePublicEnvironment({
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_publicfixture',
      SUPABASE_SECRET_KEY: 'private-key',
    }),
  ).toEqual({
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_publicfixture',
  });
});
it('rejects service credentials at every public client boundary', () => {
  for (const key of [
    'sb_secret_value',
    `header.${btoa(JSON.stringify({ role: 'service_role' }))}.signature`,
  ]) {
    expect(() =>
      parsePublicEnvironment({
        NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
      }),
    ).toThrow();
  }
});
