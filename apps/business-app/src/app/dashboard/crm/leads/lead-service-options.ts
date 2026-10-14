export type LeadService = 'construction' | 'interior';

export type LeadServiceOption = {
  value: LeadService;
  label: string;
};

/** Map canonical active industry keys, never arbitrary text entered by a client. */
export function leadServiceFromIndustryKey(key: string): LeadService | null {
  const normalized = key.toLowerCase().replaceAll('-', '_');
  if (normalized === 'construction') return 'construction';
  if (['interior', 'interiors', 'interior_design'].includes(normalized))
    return 'interior';
  return null;
}
