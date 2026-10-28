export function parsePublicGithubRepo(value: string): { owner:string; repo:string } | null {
  try {
    const u = new URL(value.trim());
    if (u.protocol !== 'https:' || u.hostname.toLowerCase() !== 'github.com' ||
        u.username || u.password || u.search || u.hash) return null;
    const parts = u.pathname.replace(/\/$/,'').replace(/\.git$/i,'').split('/').filter(Boolean);
    if (parts.length !== 2 || parts.some(part => !/^[a-z0-9_.-]{1,100}$/i.test(part)))
      return null;
    return {owner:parts[0]!,repo:parts[1]!};
  } catch { return null; }
}

