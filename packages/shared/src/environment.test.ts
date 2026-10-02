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
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'public-key',
      SUPABASE_SECRET_KEY: 'private-key',
    }),
  ).toEqual({
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'public-key',
  });
});
