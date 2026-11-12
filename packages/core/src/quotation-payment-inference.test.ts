import { describe, expect, it } from 'vitest';
import {
  inferStagePaymentLinks,
  representativePaymentStage,
} from './quotation-payment-plan';
import { constructionPlanFromQuotedDescriptions } from './quote-construction-handoff';

const quote = (floors: string[]) =>
  'SFT_ESTIMATE_V2:' +
  JSON.stringify({
    rows: floors.map((name) => ({
      name,
      kind: 'floor',
      lengthFeet: '50',
      widthFeet: '60',
      ratePerSqft: '1850.00',
      areaSqft: '3000.00',
      amount: '5550000.00',
    })),
    totalAreaSqft: String(3000 * floors.length) + '.00',
    additionalAreaSqft: '0.00',
    total: '5550000.00',
    materials: [],
  });
// The payment stages as saved on a real production quotation (no explicit links).
const names = [
  'Agreement & advance',
  'Foundation & plinth',
  'RCC structure',
  'Brickwork & roofing',
  'Finishing works',
  'Handover',
];

describe('payment stages linked to quoted construction stages automatically', () => {
  const plan = constructionPlanFromQuotedDescriptions([
    quote(['Ground Floor', 'First Floor']),
  ])!;
  const codes = plan.stages.map((s) => s.instanceCode);
  const links = inferStagePaymentLinks(names, codes)!;

  it('leaves the advance row for the advance request and never links design stages', () => {
    expect(links[0]).toEqual([]);
    expect(
      links
        .flat()
        .some((code) => /^(PRECONSTRUCTION|DESIGN|QUOTED_SCOPE)/.test(code)),
    ).toBe(false);
  });
  it('maps each named payment to the stages it covers, on every floor', () => {
    expect(links[1]).toEqual(
      expect.arrayContaining(['SITE_PREP', 'FOUNDATION', 'PLINTH']),
    );
    expect(links[2]!.filter((c) => c.startsWith('RCC/'))).toHaveLength(2);
    expect(links[3]!.every((c) => c.startsWith('MASONRY/'))).toBe(true);
    expect(links[3]).toHaveLength(2);
    expect(links[4]!.some((c) => c.startsWith('TILES/'))).toBe(true);
    expect(links[5]).toEqual(['HANDOVER']);
  });
  it('assigns every construction stage to at most one payment', () => {
    const flat = links.flat();
    expect(new Set(flat).size).toBe(flat.length);
  });
  it('picks the stage whose certification implies the whole payment group', () => {
    const stages = plan.stages.map((s, i) => ({
      code: s.instanceCode,
      dependsOn: s.dependsOn,
      sequence: i,
    }));
    expect(representativePaymentStage(links[1]!, stages)).toBe('PLINTH');
    const rcc = representativePaymentStage(links[2]!, stages)!;
    expect(rcc.startsWith('RCC/')).toBe(true);
    expect(
      stages
        .find((s) => s.code === rcc)!
        .dependsOn.some((d) => d.startsWith('RCC/')),
    ).toBe(true);
    expect(representativePaymentStage(links[5]!, stages)).toBe('HANDOVER');
  });
  it('refuses to pick a stage when no single certification covers the whole group', () => {
    const stages = plan.stages.map((s, i) => ({
      code: s.instanceCode,
      dependsOn: s.dependsOn,
      sequence: i,
    }));
    // Finishing spans plaster, tiles, paint and doors, which run in parallel.
    expect(representativePaymentStage(links[4]!, stages)).toBeNull();
  });
  it('returns null when no payment name describes construction work', () => {
    expect(
      inferStagePaymentLinks(
        ['Advance', 'Second instalment', 'Balance'],
        codes,
      ),
    ).toBeNull();
  });
});
