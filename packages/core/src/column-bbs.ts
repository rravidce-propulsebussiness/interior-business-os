/** Preliminary column takeoff, not an approved structural bar schedule.
 * All dimensions in mm. A physical bar is bought once, in the stage it is
 * first cut; unconsumed lengths carry forward by diameter. */
export type ColumnBbsDetails = {
  footingRef?: string;
  footingBottomDepthMm?: number;
  meshOffsetMm?: number;
  jointDepthMm?: number;
  baseExtraMm?: number;
  roofExtraMm?: number;
  lapMm?: number;
  ringCutLengthMm?: number;
  crossTieCount?: number;
  crossTieCutLengthMm?: number;
};

export function normalizeColumnBbs(raw: unknown): ColumnBbsDetails {
  if (!raw || typeof raw !== 'object') return {};
  const row = raw as Record<string, unknown>;
  const result: ColumnBbsDetails = {};
  if (typeof row.footingRef === 'string')
    result.footingRef = row.footingRef.slice(0, 40);
  for (const key of [
    'footingBottomDepthMm',
    'meshOffsetMm',
    'jointDepthMm',
    'baseExtraMm',
    'roofExtraMm',
    'lapMm',
    'ringCutLengthMm',
    'crossTieCount',
    'crossTieCutLengthMm',
  ] as const) {
    const n = row[key];
    if (typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 30000)
      result[key] = Math.round(n);
  }
  return result;
}

/** Full tension development length of deformed bars, IS 456:2000 26.2.1.
 * A longer engineer-specified lap always wins. No compression reduction. */
export function columnTensionLapMm(
  diameter: number,
  grade: number,
  fy: number,
) {
  const bond =
    grade >= 40
      ? 1.9
      : ({ 20: 1.2, 25: 1.4, 30: 1.5, 35: 1.7 } as Record<number, number>)[
          grade
        ];
  return bond && fy > 0
    ? Math.ceil((diameter * 0.87 * fy) / (4 * bond * 1.6))
    : undefined;
}

export type ColumnCut = {
  stage: number;
  diameter: number;
  lengthMm: number;
  count: number;
  mark: string;
};
type Bar = { dia: number; count: number };
type Lap = { floor: number; start: number; end: number };
type Floor = { heightMm: number; jointDepthMm: number };
type PlanInput = {
  mark: string;
  count: number;
  bars: Bar[];
  floors: Floor[];
  meshToPlinthMm: number;
  concreteToPlinthMm: number;
  widthMm: number;
  depthMm: number;
  coverMm: number;
  ringDia: number;
  ringSpacingMm: number;
  lapMm: number;
  stockMm: number;
  cutLossMm: number;
  bbs: ColumnBbsDetails;
};

export function planColumnCuts(p: PlanInput) {
  const warnings: string[] = [];
  const cuts: ColumnCut[] = [];
  const notes: string[][] = p.floors.map(() => []);
  const laps: Lap[] = [];
  const floorBases = p.floors.map(
    (_, i) =>
      p.meshToPlinthMm +
      p.floors.slice(0, i).reduce((a, f) => a + f.heightMm, 0),
  );
  const roof = p.meshToPlinthMm + p.floors.reduce((a, f) => a + f.heightMm, 0);
  const maxDim = Math.max(p.widthMm, p.depthMm);
  // IS 13920 ductile column lap screening: full lap inside central half,
  // outside the joint and twice the greatest column dimension from its faces.
  const zones = p.floors.map((f, i) => {
    const clear = f.heightMm - f.jointDepthMm;
    const margin = Math.max(clear / 4, 2 * maxDim);
    const low = floorBases[i]! + margin;
    const high = floorBases[i]! + clear - margin;
    const start = Math.ceil((low + high - p.lapMm) / 2);
    return {
      floor: i,
      start,
      end: start + p.lapMm,
      valid:
        clear > 0 && p.lapMm > 0 && start >= low && start + p.lapMm <= high,
    };
  });
  const barArea = p.bars.reduce((a, b) => a + b.count * b.dia ** 2, 0);
  const groups: { area: number; bars: Bar[] }[] = [];
  let mainPending = false;
  // Partition by steel area, not count. Never assume adjacent splice groups
  // may overlap, even where two short laps might fit in a single storey.
  for (const b of [...p.bars].sort((a, b) => b.dia - a.dia)) {
    for (let j = 0; j < b.count; j++) {
      let g = groups.find((g) => g.area + b.dia ** 2 <= barArea / 2);
      if (!g) {
        g = { area: 0, bars: [] };
        groups.push(g);
      }
      g.area += b.dia ** 2;
      const old = g.bars.find((x) => x.dia === b.dia);
      if (old) old.count++;
      else g.bars.push({ dia: b.dia, count: 1 });
    }
  }
  const baseExtra = p.bbs.baseExtraMm ?? 0;
  const roofExtra = p.bbs.roofExtraMm ?? 0;
  if (p.bbs.baseExtraMm === undefined || p.bbs.roofExtraMm === undefined)
    warnings.push(
      'Footing/roof anchorage extra lengths not entered; straight length only, pending drawing.',
    );
  const reserved = new Set<number>();
  const available = p.stockMm - p.cutLossMm;
  for (const [gi, g] of groups.entries()) {
    const mark = p.mark + '-G' + (gi + 1);
    const chosen: Lap[] = [];
    let start = 0;
    let extra = baseExtra;
    if (roof + baseExtra + roofExtra > available && g.area > barArea / 2) {
      mainPending = true;
      warnings.push(
        mark +
          ': exceeds 50% of steel area; approved splice schedule or longer stock required.',
      );
      continue;
    }
    // Prefer upper-storey lap locations, leave ground storey as a fallback
    // only when an actual stock length cannot otherwise reach a legal zone.
    while (true) {
      const eligible = zones.filter(
        (z) =>
          z.valid &&
          !reserved.has(z.floor) &&
          !chosen.some((c) => c.floor === z.floor) &&
          z.start > start &&
          z.end - start + extra <= available,
      );
      const preferred =
        g.area <= barArea / 2
          ? eligible.find(
              (z) => z.floor > 0 && (z.floor - 1) % groups.length === gi,
            )
          : undefined;
      const next =
        preferred ??
        (roof - start + extra + roofExtra > available
          ? eligible.at(-1)
          : undefined);
      if (!next) break;
      chosen.push(next);
      start = next.start;
      extra = 0;
    }
    if (roof - start + extra + roofExtra > available) {
      mainPending = true;
      warnings.push(
        mark +
          ': no non-overlapping central-half lap layout fits stock; obtain approved longer bars/couplers or revised schedule.',
      );
      continue;
    }
    for (const z of chosen) {
      reserved.add(z.floor);
      laps.push(z);
    }
    let from = 0;
    let stage = 0;
    for (const [i, z] of [
      ...chosen,
      { floor: p.floors.length - 1, start: roof, end: roof },
    ].entries()) {
      const terminal = i === chosen.length;
      const lengthMm = Math.ceil(
        z.end - from + (i === 0 ? baseExtra : 0) + (terminal ? roofExtra : 0),
      );
      for (const bar of g.bars)
        cuts.push({
          stage,
          diameter: bar.dia,
          lengthMm,
          count: bar.count * p.count,
          mark: mark + (terminal ? '-roof' : '-L' + (i + 1)),
        });
      notes[stage]!.push(
        mark +
          ': ' +
          lengthMm +
          ' mm × ' +
          g.bars.map((b) => b.count * p.count + ' nos Ø' + b.dia).join(' + ') +
          (terminal
            ? ' to roof'
            : ' to lap end in floor ' +
              (z.floor + 1) +
              ' (' +
              (z.start - floorBases[z.floor]!) +
              '–' +
              (z.end - floorBases[z.floor]!) +
              ' mm above slab/plinth)'),
      );
      from = z.start;
      stage = z.floor;
    }
  }
  const centreW = p.widthMm - 2 * p.coverMm - p.ringDia;
  const centreD = p.depthMm - 2 * p.coverMm - p.ringDia;
  const hook = Math.max(8 * p.ringDia, 75);
  // Preliminary straight-centreline perimeter + two 135-degree hook tails.
  // Actual bend radius/mandrel and shape allowance must be supplied by BBS.
  const ringLength =
    p.bbs.ringCutLengthMm || Math.ceil(2 * (centreW + centreD) + 2 * hook);
  if (!p.bbs.ringCutLengthMm)
    warnings.push(
      'Ring cut uses centreline perimeter + two 135° hook tails; verify bend allowance/mandrel against drawing.',
    );
  if (Math.min(p.widthMm, p.depthMm) < 300)
    warnings.push(
      'Column dimension below 300 mm; verify applicable ductile detailing minimum with engineer.',
    );
  if (p.bbs.crossTieCount === undefined)
    warnings.push('Cross-ties and ring arrangement not confirmed.');
  let ringPending = false;
  if (
    centreW <= 0 ||
    centreD <= 0 ||
    ringLength <= 0 ||
    ringLength > available ||
    (p.bbs.crossTieCount &&
      (!p.bbs.crossTieCutLengthMm || p.bbs.crossTieCutLengthMm > available))
  ) {
    warnings.push(
      'Ring/cross-tie geometry or stock length invalid; ring quantity pending.',
    );
    ringPending = true;
  } else {
    const endSpacing = Math.max(
      1,
      Math.min(
        p.ringSpacingMm,
        75,
        6 * Math.min(...p.bars.map((b) => b.dia)),
        Math.min(p.widthMm, p.depthMm) / 4,
      ),
    );
    const regularSpacing = Math.max(
      1,
      Math.min(p.ringSpacingMm, Math.min(p.widthMm, p.depthMm) / 2, 150),
    );
    for (const [i, f] of p.floors.entries()) {
      const lo =
        i === 0
          ? Math.max(0, p.meshToPlinthMm - p.concreteToPlinthMm)
          : floorBases[i]!;
      const base = floorBases[i]!;
      const hi = base + f.heightMm;
      const clear = Math.max(0, f.heightMm - f.jointDepthMm);
      const confine = Math.max(clear / 6, maxDim, 450);
      const endZones = [
        { start: lo, end: Math.min(hi, base + confine) },
        { start: Math.max(lo, base + clear - confine), end: hi },
      ];
      const lapZones = laps
        .filter((z) => z.floor === i)
        .map((z) => ({ start: z.start, end: z.end }));
      const bounds = [
        ...new Set([
          lo,
          hi,
          ...endZones.flatMap((z) => [z.start, z.end]),
          ...lapZones.flatMap((z) => [z.start, z.end]),
        ]),
      ]
        .filter((x) => x >= lo && x <= hi)
        .sort((a, b) => a - b);
      let rings = i === 0 ? 1 : 0; // boundary ring counted once
      for (let j = 1; j < bounds.length; j++) {
        const a = bounds[j - 1]!,
          b = bounds[j]!,
          mid = (a + b) / 2;
        const spacing = endZones.some((z) => mid >= z.start && mid <= z.end)
          ? endSpacing
          : lapZones.some((z) => mid >= z.start && mid <= z.end)
            ? Math.min(regularSpacing, 100)
            : regularSpacing;
        rings += Math.ceil((b - a) / Math.max(1, spacing));
      }
      cuts.push({
        stage: i,
        diameter: p.ringDia,
        lengthMm: ringLength,
        count: rings * p.count,
        mark: p.mark + '-R',
      });
      if (p.bbs.crossTieCount && p.bbs.crossTieCutLengthMm)
        cuts.push({
          stage: i,
          diameter: p.ringDia,
          lengthMm: p.bbs.crossTieCutLengthMm,
          count: rings * p.count * p.bbs.crossTieCount,
          mark: p.mark + '-X',
        });
      notes[i]!.push(
        p.mark +
          ': ' +
          rings +
          ' rings/column × ' +
          ringLength +
          ' mm; centreline ' +
          Math.round(centreW) +
          '×' +
          Math.round(centreD) +
          ' mm; 2 hook tails × ' +
          hook +
          ' mm; spacing normal ≤ ' +
          Math.floor(regularSpacing) +
          ' mm, confinement ≤ ' +
          Math.floor(endSpacing) +
          ' mm, lap ≤ 100 mm; confirm joint/footing ties and exact bend shape.',
      );
    }
  }
  return { cuts, notes, warnings, pending: mainPending || ringPending };
}

export type ColumnStockRow = {
  stage: number;
  diameter: number;
  rods: number;
  installedMm: number;
  openingMm: number;
  closingMm: number;
  lossMm: number;
  stockMm: number;
  /** Grouped physical cuts, including opening individual remnant lengths. */
  moves: {
    fromMm: number;
    cutMm: number;
    remainderMm: number;
    count: number;
  }[];
  remnants: { lengthMm: number; count: number }[];
};
/** Best-fit decreasing within each stage, carry actual individual remnants
 * (not a pooled total of metres) forward. Never combine short offcuts. */
export function allocateColumnStock(
  cuts: ColumnCut[],
  stockMm: number,
  cutLossMm: number,
): ColumnStockRow[] {
  const rows: ColumnStockRow[] = [];
  const inventory = new Map<number, Map<number, number>>();
  for (const stage of [...new Set(cuts.map((c) => c.stage))].sort(
    (a, b) => a - b,
  )) {
    const stageCuts = cuts.filter((c) => c.stage === stage);
    for (const diameter of [...new Set(stageCuts.map((c) => c.diameter))].sort(
      (a, b) => b - a,
    )) {
      const bin = inventory.get(diameter) ?? new Map<number, number>();
      inventory.set(diameter, bin);
      const total = () =>
        [...bin].reduce((n, [len, count]) => n + len * count, 0);
      const add = (len: number, count: number) => {
        if (len > 0 && count) bin.set(len, (bin.get(len) ?? 0) + count);
      };
      const openingMm = total();
      const moves = new Map<
        string,
        { fromMm: number; cutMm: number; remainderMm: number; count: number }
      >();
      let rods = 0,
        installedMm = 0,
        lossMm = 0;
      for (const c of stageCuts
        .filter((c) => c.diameter === diameter)
        .sort((a, b) => b.lengthMm - a.lengthMm)) {
        const need = c.lengthMm + cutLossMm;
        if (!(need > 0 && need <= stockMm))
          throw new Error('Column cut exceeds stock length');
        let remaining = c.count;
        installedMm += remaining * c.lengthMm;
        lossMm += remaining * cutLossMm;
        while (remaining > 0) {
          const best = [...bin.keys()]
            .filter((l) => l >= need)
            .sort((a, b) => a - b)[0];
          if (best === undefined) {
            // Buy only enough stock for the remaining pieces of this length.
            const per = Math.floor(stockMm / need);
            const buy = Math.ceil(remaining / per);
            rods += buy;
            add(stockMm, buy);
            continue;
          }
          const available = bin.get(best)!;
          const take = Math.min(available, remaining);
          if (take === available) bin.delete(best);
          else bin.set(best, available - take);
          add(best - need, take);
          const key = best + ':' + c.lengthMm;
          const old = moves.get(key);
          if (old) old.count += take;
          else
            moves.set(key, {
              fromMm: best,
              cutMm: c.lengthMm,
              remainderMm: best - need,
              count: take,
            });
          remaining -= take;
        }
      }
      rows.push({
        stage,
        diameter,
        rods,
        installedMm,
        openingMm,
        closingMm: total(),
        lossMm,
        stockMm,
        moves: [...moves.values()],
        remnants: [...bin]
          .sort(([a], [b]) => b - a)
          .map(([lengthMm, count]) => ({ lengthMm, count })),
      });
    }
  }
  return rows;
}
