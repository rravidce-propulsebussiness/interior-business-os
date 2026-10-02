import { compileWebsite, type WebsiteBuild } from './compiler';

/** Authorization and hostname resolution must run before every cache lookup. */
export function createPublishedBuildCache(capacity = 16) {
  const entries = new Map<string, WebsiteBuild>();
  return {
    get(hostname: string, publishedVersion: string, input: unknown) {
      const key = JSON.stringify([hostname, publishedVersion]);
      const existing = entries.get(key);
      if (existing) {
        entries.delete(key);
        entries.set(key, existing);
        return existing;
      }
      const build = compileWebsite(input);
      entries.set(key, build);
      while (entries.size > Math.max(1, capacity))
        entries.delete(entries.keys().next().value!);
      return build;
    },
  };
}
