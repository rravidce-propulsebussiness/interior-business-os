import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
const read = (path:string) => readFileSync(new URL(path,import.meta.url),'utf8');
describe('multi-language GitHub source pulling',()=>{
  it('supports source browsing without running code inside the website',()=>{
    const action=read('./github-pull.ts');
    const ui=read('./website-git-tools.tsx');
    expect(action).toContain('export async function inspectGithubSourceFiles');
    expect(action).toContain('export async function retrieveGithubSourceFile');
    expect(action).toContain('tsx|mjs|cjs');
    expect(action).toContain('php|py|go|rs|java');
    expect(action).toContain('safeSourcePath(filename)');
    expect(action).toContain("await websiteServices('website.custom_code.view')");
    expect(ui).toContain('Pull selected source file');
    expect(ui).toContain('Source browsing is read-only');
  });
  it('does not use arbitrary caller hosts for GitHub requests',()=>{
    const action=read('./github-pull.ts');
    expect(action).toContain("'api.github.com','raw.githubusercontent.com'");
    expect(action).toContain("redirect:'error'");
    expect(action).toContain("!path.includes('..')");
  });
  it('provides actionable publishing and upload error categories',()=>{
    const a=read('./actions.ts');
    const route=read('./[id]/uploads/media/route.ts');
    expect(a).toContain('WEBSITE_BUILD_SIGNATURE_MISMATCH');
    expect(a).toContain('Website signing is not configured');
    expect(route).toContain('WEBSITE_MEDIA_QUOTA');
    expect(route).toContain('WEBSITE_BUILD_SIGNATURE_MISMATCH');
  });
});
