import { describe, expect, it } from 'vitest';
import { parsePublicGithubRepo } from './github-pull-url';

describe('GitHub public static website import URL guard', () => {
  it('accepts only a repository root on GitHub', () => {
    expect(parsePublicGithubRepo('https://github.com/acme/site')).toEqual({
      owner:'acme',repo:'site',
    });
    expect(parsePublicGithubRepo('https://github.com/acme/site.git')).toEqual({
      owner:'acme',repo:'site',
    });
    expect(parsePublicGithubRepo('https://github.com/acme/site/tree/main')).toBeNull();
    expect(parsePublicGithubRepo('https://github.com/acme/site?ref=main')).toBeNull();
  });
  it('does not let a caller substitute a raw-code or unrelated host', () => {
    expect(parsePublicGithubRepo('https://github.com.evil.example/acme/site')).toBeNull();
    expect(parsePublicGithubRepo('http://github.com/acme/site')).toBeNull();
    expect(parsePublicGithubRepo('https://evil.example/acme/site')).toBeNull();
    expect(parsePublicGithubRepo('https://token@github.com/acme/site')).toBeNull();
  });
});
