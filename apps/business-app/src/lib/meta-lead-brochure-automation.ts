export type LeadServiceInterest =
  'construction' | 'interiors' | 'both' | 'unknown';

/** Classify the service answer already mapped from Meta form fields. */
export function classifyLeadServiceInterest(
  value: string,
): LeadServiceInterest {
  const normalized = value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  if (!normalized) return 'unknown';

  const asksForBoth = /\bboth\b|\ball\s+(services|of\s+the\s+above)\b/.test(
    normalized,
  );
  const construction = /\b(construction|construct|build|building|civil)\b/.test(
    normalized,
  );
  const interiors =
    /\b(interior|interiors|interior\s+design|furnishing|fit\s*out)\b/.test(
      normalized,
    );
  if (asksForBoth || (construction && interiors)) return 'both';
  if (construction) return 'construction';
  if (interiors) return 'interiors';
  return 'unknown';
}

export function brochureTemplateForInterest(interest: LeadServiceInterest) {
  return interest === 'construction' || interest === 'interiors'
    ? 'service'
    : 'carousel';
}
