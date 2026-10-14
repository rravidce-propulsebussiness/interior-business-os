import {
  leadServiceFromIndustryKey,
  type LeadService,
} from './lead-service-options';

export type LeadCategory = LeadService | null;
export type IndustryIdentity = { id: string; key: string };

const canonicalCategory = (value: unknown): LeadService | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (normalized === 'construction') return 'construction';
  if (['interior', 'interiors', 'interior_design'].includes(normalized))
    return 'interior';
  return null;
};

/**
 * A BHK or property type is never sufficient evidence of the service.
 * Prefer the tenant's actual industry membership, then explicit legacy values.
 * Conflicting explicit values must be classified by a staff member.
 */
export function resolveLeadCategory(
  row: {
    industry_id?: unknown;
    service_type?: unknown;
    requirements?: unknown;
  },
  enabledIndustries: IndustryIdentity[],
): LeadCategory {
  const industryId = typeof row.industry_id === 'string' ? row.industry_id : '';
  if (industryId) {
    const industry = enabledIndustries.find((entry) => entry.id === industryId);
    // Do not silently substitute the free-form service_type for a different
    // or unrecognized industry identifier.
    return industry ? leadServiceFromIndustryKey(industry.key) : null;
  }
  const requirements =
    row.requirements &&
    typeof row.requirements === 'object' &&
    !Array.isArray(row.requirements)
      ? (row.requirements as Record<string, unknown>)
      : {};
  const fromRequirements = canonicalCategory(requirements.service);
  const fromServiceType = canonicalCategory(row.service_type);
  if (
    fromRequirements &&
    fromServiceType &&
    fromRequirements !== fromServiceType
  )
    return null;
  return fromRequirements ?? fromServiceType;
}

export const leadCategoryLabel = (category: LeadCategory): string =>
  category === 'construction'
    ? 'Construction'
    : category === 'interior'
      ? 'Interiors'
      : 'Needs classification';

export const isLegacyRequirementText = (value: unknown): value is string =>
  typeof value === 'string' &&
  Boolean(value.trim()) &&
  !canonicalCategory(value);

const humanize = (value: string): string => {
  const bhk = value.trim().match(/^(\d+)\s*[_-]?\s*bhk$/i);
  if (bhk) return bhk[1] + ' BHK';
  return value.trim().replaceAll('_', ' ');
};

export function leadRequirementLabel(row: {
  project_size?: unknown;
  service_type?: unknown;
  requirements?: unknown;
}): string {
  const requirements =
    row.requirements &&
    typeof row.requirements === 'object' &&
    !Array.isArray(row.requirements)
      ? (row.requirements as Record<string, unknown>)
      : {};
  const bhk = requirements.bhk;
  if (typeof bhk === 'string' && bhk.trim()) return humanize(bhk);
  if (typeof row.project_size === 'string' && row.project_size.trim())
    return humanize(row.project_size);
  if (isLegacyRequirementText(row.service_type))
    return humanize(row.service_type);
  return '';
}
