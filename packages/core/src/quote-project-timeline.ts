import { z } from 'zod';
import { constructionPlanFromQuotedDescriptions } from './quote-construction-handoff';
import type { StageRequirementsMap } from './quotation-stage-requirements';

export const quoteLineSchema = z.object({
  id: z.uuid(),
  name: z.string().max(200),
  description: z.string().max(20000),
});
export type QuoteLine = z.infer<typeof quoteLineSchema>;

export interface ProjectQuotedTimeline {
  industry: 'construction' | 'interior';
  template: {
    industry: 'construction' | 'interior';
    version: string;
    stages: unknown[];
  };
  zones: { code: string; name: string }[];
  stages: {
    instanceCode: string;
    templateCode: string;
    phase: string;
    floorCode: string | null;
    title: string;
    explanation: string;
    dependsOn: string[];
    holdPoint: string | null;
    activities: string[];
    inspectionTopics: string[];
  }[];
}

const compact = (value: string, max = 180) =>
  value.replace(/\s+/g, ' ').trim().slice(0, max);
const roomFromDescription = (description: string): string | null => {
  const match = description.match(/^Room:\s*([^\r\n]+)/im);
  return match ? compact(match[1]!, 85) : null;
};
const category = (value: string) => value.toLowerCase();
const stage = (
  code: string,
  phase: string,
  title: string,
  explanation: string,
  dependsOn: string[],
  activities: string[],
  holdPoint: string | null = null,
) => ({
  instanceCode: code,
  templateCode: code,
  phase,
  floorCode: null,
  title,
  explanation,
  dependsOn,
  holdPoint,
  activities,
  inspectionTopics: [] as string[],
});

/**
 * A project inherits its INDUSTRY and actual line scope from the immutable,
 * approved quotation revision, never from a generic user-selected template.
 * An interior timeline contains no unquoted civil/MEP/ceiling tasks.
 */
export function projectTimelineFromQuote(
  industry: string,
  linesInput: readonly QuoteLine[],
  requirements:StageRequirementsMap={},
): ProjectQuotedTimeline | null {
  const lines = z.array(quoteLineSchema).max(250).parse(linesInput);
  if (industry === 'construction') {
    const result = constructionPlanFromQuotedDescriptions(
      lines.map((line) => line.description),
    );
    return result
      ? {
          industry: 'construction',
          template: result.template,
          zones: result.floors,
          stages: result.stages.map((s) => {
            const saved=requirements[s.instanceCode];
            return {
              ...s,dependsOn:[...s.dependsOn],
              activities:saved?.work??[...s.activities],
              inspectionTopics:saved?.checks??[...s.inspectionTopics],
            };
          }),
        }
      : null;
  }
  if (industry !== 'interior' || lines.length === 0) return null;
  const scoped = lines.filter(
    (line) => line.name.trim() || line.description.trim(),
  );
  if (!scoped.length) return null;
  const rooms = [
    ...new Set(
      scoped
        .map((line) => roomFromDescription(line.description))
        .filter((name): name is string => !!name),
    ),
  ];
  const zones = rooms.slice(0, 64).map((name, i) => ({
    code: 'ROOM_' + String(i + 1).padStart(2, '0'),
    name,
  }));
  if (!zones.length)
    zones.push({ code: 'PROJECT', name: 'Project-wide scope' });

  const acceptedItems = scoped.map((line) =>
    compact(line.name + ' — ' + line.description, 230),
  );
  const allText = category(
    scoped.map((line) => line.name + ' ' + line.description).join(' '),
  );
  const matches = (pattern: RegExp) => pattern.test(allText);
  const stages: ProjectQuotedTimeline['stages'] = [];
  const add = (
    code: string,
    phase: string,
    title: string,
    explanation: string,
    activities: string[],
    holdPoint: string | null = null,
  ) => {
    const prior = stages.at(-1)?.instanceCode;
    stages.push(
      stage(
        code,
        phase,
        title,
        explanation,
        prior ? [prior] : [],
        activities,
        holdPoint,
      ),
    );
  };
  // Preserve every included item, not merely the first 80 BOQ lines.
  for (let start = 0; start < acceptedItems.length; start += 75) {
    const page = Math.floor(start / 75) + 1;
    add(
      page === 1 ? 'QUOTED_SCOPE' : 'QUOTED_SCOPE_' + page,
      'preconstruction',
      page === 1
        ? 'Accepted interior scope & BOQ'
        : 'Accepted interior scope & BOQ (continued ' + page + ')',
      'The contracted room-wise items, package and specifications are frozen from the approved quotation.',
      acceptedItems.slice(start, start + 75).map((x) => compact(x, 235)),
      'contract',
    );
  }
  add(
    'SITE_SURVEY',
    'survey',
    'Site survey & final measurements',
    'Measure rooms, levels and actual site conditions before approved execution drawings.',
    [
      'Measure the quoted rooms/areas: ' +
        zones
          .map((zone) => zone.name)
          .join(', ')
          .slice(0, 170),
      'Record existing services and site constraints',
      'Confirm access and required building permissions',
    ],
  );
  add(
    'DESIGN_APPROVAL',
    'design',
    'Interior drawings & client sign-off',
    'Approve kitchen, wardrobe, joinery and service drawings for the contracted scope.',
    [
      'Review room layouts and working drawings for included quote items',
      'Record finish, material, hardware and client design decisions',
    ],
    'client_design',
  );
  add(
    'MATERIAL_APPROVAL',
    'procurement',
    'Material samples & procurement',
    'Confirm quoted grades and finishes before issuing purchase requisitions.',
    [
      'Review contracted brands, finish selections and hardware specifications',
      'Prepare approved requisitions for quoted work only',
    ],
  );
  if (
    matches(
      /demoli|masonry|civil work|partition|waterproof|plaster|tiling|tile|flooring|granite|stone/i,
    )
  ) {
    add(
      'CIVIL_PREPARATION',
      'civil',
      'Quoted civil and surface work',
      'Execute only the contracted civil, floor and preparation items.',
      scoped
        .filter((line) =>
          /demoli|masonry|civil|partition|waterproof|plaster|til|floor|granite|stone/i.test(
            line.name + ' ' + line.description,
          ),
        )
        .slice(0, 55)
        .map((line) => compact(line.name)),
      'quality',
    );
  }
  if (
    matches(
      /electrical|light|wiring|switch|plumb|sanitary|water supply|hvac|ac point|duct/i,
    )
  ) {
    add(
      'SERVICES',
      'services',
      'Quoted electrical, plumbing & services',
      'Coordinate and test concealed service work before covering finishes.',
      scoped
        .filter((line) =>
          /electrical|light|wiring|switch|plumb|sanitary|hvac|duct/i.test(
            line.name + ' ' + line.description,
          ),
        )
        .slice(0, 55)
        .map((line) => compact(line.name)),
      'quality',
    );
  }
  if (matches(/false ceil|gypsum|pop ceiling|ceiling work/i))
    add(
      'CEILING',
      'installation',
      'False ceiling installation',
      'Install and inspect quoted ceiling work and related services.',
      [
        'Review ceiling setting-out and support system',
        'Inspect board joints and light cut-outs',
      ],
      'quality',
    );
  if (
    matches(
      /wardrobe|kitchen|cabinet|loft|tv unit|pooja|panelling|paneling|furniture|carpentry|joinery|dresser|study table/i,
    )
  ) {
    add(
      'FABRICATION',
      'fabrication',
      'Carpentry & modular fabrication',
      'Fabricate quoted furniture against approved measurements and finishes.',
      [
        'Verify approved boards, edge-banding, laminate and hardware',
        'Inspect workshop dimensions and joinery finish',
      ],
      'quality',
    );
    for (const zone of zones) {
      const affected = scoped.filter(
        (line) => roomFromDescription(line.description) === zone.name,
      );
      if (!affected.length && zone.code !== 'PROJECT') continue;
      add(
        'INSTALL_' + zone.code,
        'installation',
        'Install quoted items — ' + zone.name,
        'Install the items contracted for this room or area.',
        (affected.length ? affected : scoped)
          .slice(0, 65)
          .map((line) =>
            compact(
              line.name + (line.description ? ': ' + line.description : ''),
              235,
            ),
          ),
        'quality',
      );
    }
  }
  if (matches(/paint|polish|wallpaper|veneer|finish|laminate|primer|putty/i))
    add(
      'FINISHES',
      'finishes',
      'Surface finishing & touch-ups',
      'Check the supplied quoted finishes and remedy visible damage.',
      [
        'Protect installed units, verify quoted surface/edge finishes',
        'Complete scheduled finishes and touch-ups',
      ],
      'quality',
    );
  add(
    'FINAL_CHECK',
    'quality',
    'Functional checks & snag closure',
    'Inspect the delivered quoted scope, create snags and verify remedial work.',
    [
      'Check quoted hardware, doors, drawers, electrical and plumbing where included',
      'Record final site photos and close quality snags',
    ],
    'quality',
  );
  add(
    'HANDOVER',
    'handover',
    'Client walkthrough & handover',
    'Hand over the contracted rooms and document warranties and approvals.',
    [
      'Client walkthrough and snag sign-off',
      'As-built details and warranty documentation',
    ],
    'handover',
  );
  if (stages.length > 900) throw new Error('Too many quoted execution stages');
  return {
    industry: 'interior',
    zones,
    template: { industry: 'interior', version: '1.0.0', stages: [] },
    stages,
  };
}
