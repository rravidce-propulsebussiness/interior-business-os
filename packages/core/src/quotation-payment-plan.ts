/** Customer-facing milestone rows must come from a saved quotation revision,
 * never from an unapproved example schedule.
 */
export type StagePaymentMilestone = { name: string; percent: number };

export function savedStagePaymentPlan(
  terms: string,
): StagePaymentMilestone[] | null {
  const match = terms.match(
    /\[STAGE_PAYMENT_PLAN\]([\s\S]*?)\[\/STAGE_PAYMENT_PLAN\]/,
  );
  if (!match) return null;
  const lines = (match[1] ?? '').trim().split(/\r?\n/);
  if (!lines.length || lines.length > 40) return null;
  const result: StagePaymentMilestone[] = [];
  for (const line of lines) {
    const index = line.lastIndexOf('|');
    if (index < 1) return null;
    const name = line.slice(0, index).trim();
    const rawPercent = line.slice(index + 1).trim();
    const percent = Number(rawPercent);
    if (
      !name ||
      name.length > 100 ||
      !/^\d+(?:\.\d{1,2})?$/.test(rawPercent) ||
      !Number.isFinite(percent) ||
      percent <= 0 ||
      percent > 100
    )
      return null;
    result.push({ name, percent });
  }
  const total = result.reduce((sum, row) => sum + row.percent, 0);
  return Math.abs(total - 100) < 0.001 ? result : null;
}

export const hasSavedStagePaymentPlan = (terms: string) =>
  savedStagePaymentPlan(terms) !== null;

/**
 * Optional immutable quote-stage associations saved alongside the customer
 * payment lines. A stage association is a scope reference only; it never
 * authorizes invoicing, collection, or automatic progress certification.
 * Legacy quotes without this block remain valid and unlinked.
 */
export function savedStagePaymentLinks(terms: string): string[][] | null {
  const plan = savedStagePaymentPlan(terms);
  const marker = terms.match(
    /\[STAGE_PAYMENT_LINKS\]([\s\S]*?)\[\/STAGE_PAYMENT_LINKS\]/g,
  );
  if (!marker?.length) return null;
  if (marker.length !== 1 || !plan) return null;
  const raw = marker[0]!
    .replace(/^\[STAGE_PAYMENT_LINKS\]/, '')
    .replace(/\[\/STAGE_PAYMENT_LINKS\]$/, '')
    .trim();
  try {
    const decoded: unknown = JSON.parse(raw);
    if (!Array.isArray(decoded) || decoded.length !== plan.length) return null;
    const result: string[][] = [];
    for (const row of decoded) {
      if (
        !Array.isArray(row) ||
        row.length > 18 ||
        !row.every(
          (x) =>
            typeof x === 'string' &&
            /^[A-Z][A-Z0-9_]*(?:\/[A-Z][A-Z0-9_]*)?$/.test(x) &&
            x.length <= 120,
        ) ||
        new Set(row).size !== row.length
      )
        return null;
      result.push(row);
    }
    return result;
  } catch {
    return null;
  }
}

export function encodeStagePaymentLinks(
  linked: readonly (readonly string[])[],
): string {
  const result = JSON.stringify(linked);
  if (
    !linked.length ||
    linked.length > 40 ||
    result.length > 8000 ||
    linked.some(
      (row) =>
        row.length > 18 ||
        new Set(row).size !== row.length ||
        row.some(
          (key) =>
            key.length > 120 ||
            !/^[A-Z][A-Z0-9_]*(?:\/[A-Z][A-Z0-9_]*)?$/.test(key),
        ),
    )
  )
    throw new Error('Invalid construction stage associations');
  return '[STAGE_PAYMENT_LINKS]\n' + result + '\n[/STAGE_PAYMENT_LINKS]';
}

/**
 * Many saved quotations name their payment stages ("Foundation & plinth",
 * "RCC structure", "Brickwork & roofing") without the optional explicit
 * [STAGE_PAYMENT_LINKS] block. Match each named payment stage to the quoted
 * construction stages it covers, so the project timeline can show — and the
 * existing certified-stage rule can request — each payment automatically.
 *
 * Rules: an agreement/advance/booking first row covers no construction stage
 * (it is the advance request). Planning and design stages are never matched.
 * Each construction stage belongs to the first payment row whose name covers
 * it; stages no row mentions stay unlinked rather than guessed.
 */
const PAYMENT_STAGE_WORDS: Record<string, RegExp> = {
  SITE_PREP: /\b(site|excavat\w*|marking|setting\s*out|foundation)\b/,
  FOUNDATION: /\b(foundation|footings?|pcc)\b/,
  PLINTH: /\b(plinth|basement|foundation)\b/,
  RCC: /\b(rcc|slabs?|structure|structural|frames?|columns?|roof\s*slab|roofing)\b/,
  MASONRY: /\b(brick\w*|masonry|blocks?|walls?)\b/,
  INTERNAL_PLASTER: /\b(plaster\w*|finish\w*)\b/,
  EXTERNAL_PLASTER: /\b(plaster\w*|elevation|exterior|finish\w*)\b/,
  PLUMBING_PAINT: /\b(paint\w*|plumb\w*|electric\w*|finish\w*)\b/,
  TILES: /\b(tiles?|tiling|flooring|finish\w*)\b/,
  DOORS: /\b(doors?|windows?|joinery|finish\w*)\b/,
  HANDOVER: /\b(handover|hand\s*over|completion|possession|final)\b/,
};
export const stageTemplateOf = (instanceCode: string) =>
  instanceCode.split('/')[0] ?? instanceCode;

export function inferStagePaymentLinks(
  paymentNames: readonly string[],
  stageCodes: readonly string[],
): string[][] | null {
  const rows: string[][] = paymentNames.map(() => []);
  const claimed = new Set<string>();
  paymentNames.forEach((raw, index) => {
    const name = raw.toLowerCase();
    if (index === 0 && /advance|agreement|booking|signing/.test(name)) return;
    for (const code of stageCodes) {
      if (claimed.has(code)) continue;
      const words = PAYMENT_STAGE_WORDS[stageTemplateOf(code)];
      if (words?.test(name)) {
        rows[index]!.push(code);
        claimed.add(code);
      }
    }
  });
  return rows.some((row) => row.length) ? rows : null;
}

/** The one stage of a payment group whose certification implies the whole
 * group: every other member is among its prerequisites (stage certification
 * already requires every prerequisite to be certified). Returns null when no
 * single stage covers the group, so a payment is never requested early. */
export function representativePaymentStage(
  group: readonly string[],
  stages: readonly {
    code: string;
    dependsOn: readonly string[];
    sequence: number;
  }[],
): string | null {
  const byCode = new Map(stages.map((s) => [s.code, s]));
  const members = new Set(group.filter((code) => byCode.has(code)));
  if (!members.size) return null;
  const closure = (code: string) => {
    const seen = new Set<string>();
    const walk = (c: string) => {
      for (const d of byCode.get(c)?.dependsOn ?? [])
        if (!seen.has(d)) {
          seen.add(d);
          walk(d);
        }
    };
    walk(code);
    return seen;
  };
  let best: string | null = null,
    bestScore = -1,
    bestSeq = -1;
  for (const code of members) {
    const deps = closure(code);
    const score = [...members].filter((m) => m !== code && deps.has(m)).length;
    const seq = byCode.get(code)!.sequence;
    if (score > bestScore || (score === bestScore && seq > bestSeq)) {
      best = code;
      bestScore = score;
      bestSeq = seq;
    }
  }
  return bestScore === members.size - 1 ? best : null;
}
