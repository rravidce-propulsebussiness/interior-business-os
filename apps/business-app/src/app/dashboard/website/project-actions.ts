'use server';

import { revalidatePath } from 'next/cache';
import { emptyWebsite } from '@business-os/website-builder';
import { websiteJson } from '@business-os/database/website';
import { websiteServices } from './service';

type WebsiteFramework =
  | 'static' | 'react' | 'vite' | 'nextjs' | 'vue'
  | 'astro' | 'php' | 'python' | 'node' | 'other';

export type WebsiteProjectRequest = {
  name: string;
  slug: string;
  sourceKind: 'template' | 'repository';
  templateKey?: string;
  repositoryUrl?: string;
  branchName?: string;
  framework?: WebsiteFramework;
};

type RpcResponse<T> = {
  data: T | null;
  error: { message?: string; code?: string } | null;
};

type ProjectRpcClient = {
  rpc: <T = unknown>(
    name: string,
    params: Record<string, unknown>,
  ) => Promise<RpcResponse<T>>;
};

const templates = new Set([
  'construction', 'interiors', 'real-estate', 'corporate',
]);
const frameworks = new Set([
  'static', 'react', 'vite', 'nextjs', 'vue', 'astro',
  'php', 'python', 'node', 'other',
]);
const repoPattern = /^https:\/\/(?:github\.com|gitlab\.com|bitbucket\.org)\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+(?:\.git)?$/;
const publicDeploymentPattern = /^https:\/\/[A-Za-z0-9][A-Za-z0-9.-]+(?::443)?(?:\/[-A-Za-z0-9._~/]*)?$/;

function validRepository(url: string): boolean {
  return url.length <= 350 && !url.includes('..') && repoPattern.test(url);
}
function validBranch(value: string): boolean {
  return value.length <= 100 && !value.includes('..') &&
    /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value);
}
function validDeployment(value: string): boolean {
  if (!publicDeploymentPattern.test(value) || value.length > 500 ||
      value.includes('..')) return false;
  try {
    const host = new URL(value).hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost') ||
        host.endsWith('.local') || host.endsWith('.internal') ||
        host === '0.0.0.0' || host === '::1' ||
        /^(?:127|10|0|169\.254|192\.168)\./.test(host)) return false;
    return host.includes('.');
  } catch { return false; }
}

export async function createWebsiteProject(input: WebsiteProjectRequest): Promise<{
  id?: string;
  message: string;
}> {
  try {
    const name = input.name.trim();
    const slug = input.slug.trim().toLowerCase();
    const branch = (input.branchName || 'main').trim();
    const framework = input.framework || 'other';
    const repository = input.repositoryUrl?.trim() || null;
    const template = input.templateKey || null;

    if (!name || name.length > 160 ||
        slug.length < 3 || slug.length > 63 ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
      return { message: 'Enter a website name and valid subdomain slug.' };
    if (!validBranch(branch) || !frameworks.has(framework))
      return { message: 'Enter a valid repository branch and framework.' };
    if (input.sourceKind === 'template') {
      if (!template || !templates.has(template))
        return { message: 'Choose one of the available templates.' };
    } else if (input.sourceKind === 'repository') {
      if (!repository || !validRepository(repository))
        return { message: 'Connect a credential-free GitHub, GitLab or Bitbucket HTTPS repository URL.' };
    } else return { message: 'Choose Template or Repository.' };

    const s = await websiteServices('website.manage');
    // The SQL RPC performs website quota enforcement, domain reservation,
    // site creation and source linkage in ONE database transaction.
    const client = s.client as unknown as ProjectRpcClient;
    const result = await client.rpc<string>('website_project_create', {
      p_organization_id: s.context.organizationId,
      p_name: name,
      p_slug: slug,
      p_document: websiteJson(emptyWebsite(name)),
      p_source_kind: input.sourceKind,
      p_template_key: input.sourceKind === 'template' ? template : null,
      p_repository_url: input.sourceKind === 'repository' ? repository : null,
      p_branch_name: branch,
      p_framework: framework,
    });
    if (result.error || !result.data) {
      if (/Website limit reached/i.test(result.error?.message ?? ''))
        return { message: 'This business has reached its website limit. Request an additional site from Super Admin or upgrade the website package.' };
      return { message: 'Website creation failed. Verify your website entitlement, repository URL and subdomain availability.' };
    }
    revalidatePath('/dashboard/website');
    return {
      id: result.data,
      message: 'Website project created. Source settings were saved. Publishing and deployment are separate.',
    };
  } catch {
    return { message: 'Website creation is unavailable. Check website permissions and database migration status.' };
  }
}

export async function saveWebsiteProject(
  websiteId: string,
  version: number,
  data: {
    repositoryUrl: string;
    branchName: string;
    framework: WebsiteFramework;
    deploymentUrl: string;
  },
): Promise<{ version?: number; message: string }> {
  const repository = data.repositoryUrl.trim();
  const branch = data.branchName.trim();
  const deployment = data.deploymentUrl.trim();
  if (!validRepository(repository) || !validBranch(branch) ||
      !frameworks.has(data.framework) ||
      (deployment !== '' && !validDeployment(deployment)))
    return { message: 'Check the HTTPS repository, branch, framework and optional public HTTPS deployment URL.' };
  try {
    const s = await websiteServices('website.manage');
    await s.website.read(websiteId); // tenant and website-scope authorization
    const client = s.client as unknown as ProjectRpcClient;
    const result = await client.rpc<number>('website_project_configure', {
      p_organization_id: s.context.organizationId,
      p_website_id: websiteId,
      p_version: version,
      p_repository_url: repository,
      p_branch_name: branch,
      p_framework: data.framework,
      p_deployment_url: deployment || null,
    });
    if (result.error || result.data === null)
      return { message: 'Could not save settings. Reload to check permissions or changes by another developer.' };
    revalidatePath('/dashboard/website');
    return {
      version: result.data,
      message: 'Repository settings saved. Your code and backend remain independently deployed; this does not trigger a build.',
    };
  } catch {
    return { message: 'Could not save website source settings.' };
  }
}
