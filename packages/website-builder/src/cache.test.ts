import { describe, it, expect } from 'vitest';
import { createPublishedBuildCache } from './cache';
import { emptyWebsite } from './model';
describe('Published build cache', () => {
  it('keys builds by hostname and immutable version, including restores', () => {
    const cache = createPublishedBuildCache();
    const first = cache.get('one.example', 'v1', emptyWebsite('First'));
    expect(cache.get('one.example', 'v1', emptyWebsite('Unsaved draft'))).toBe(
      first,
    );
    expect(
      cache.get('one.example', 'v2', emptyWebsite('Second')).document.settings
        .name,
    ).toBe('Second');
    expect(
      cache.get('two.example', 'v1', emptyWebsite('Other tenant')).document
        .settings.name,
    ).toBe('Other tenant');
    expect(
      cache.get('one.example', 'v3', emptyWebsite('First')).document.settings
        .name,
    ).toBe('First');
  });
  it('evicts least recently used entries within its memory bound', () => {
    const cache = createPublishedBuildCache(1);
    const first = cache.get('one.example', 'v1', emptyWebsite());
    cache.get('one.example', 'v2', emptyWebsite());
    expect(cache.get('one.example', 'v1', emptyWebsite())).not.toBe(first);
  });
});
