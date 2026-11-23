/** Explicit drawing schedule for foundation footings. Never infer the reinforcement design. */
export const FOOTING_TYPES = [
  'isolated',
  'combined',
  'strap',
  'raft',
  'strip',
  'pile_cap',
] as const;
export type FootingType = (typeof FOOTING_TYPES)[number];
export type FootingGeometry = 'flat' | 'stepped' | 'sloped';
export type FootingMesh = 'single' | 'double';

export type FootingRebarSet = {
  layer: 'bottom' | 'top';
  direction: 'length' | 'width';
  dia: number;
  spacingIn: number;
};
export type DesignFootingType = {
  label: string;
  type: FootingType;
  /** Number of identical foundation groups, not column count. */
  count: number;
  /** Column labels supported by this group, e.g. "C1,C2". Informational link. */
  columnRefs: string;
  lengthFeet: number;
  widthFeet: number;
  thicknessIn: number;
  /** Only strap groups include two identical pads per group by default. */
  padsPerGroup: number;
  geometry: FootingGeometry;
  /** Additional raised step (or top footprint for a sloped foundation). */
  topLengthFeet: number;
  topWidthFeet: number;
  stepThicknessIn: number;
  edgeThicknessIn: number;
  mesh: FootingMesh;
  bottomBarDia: number;
  bottomSpacingIn: number;
  topBarDia: number;
  topSpacingIn: number;
  /** Optional per-direction and per-layer steel schedule; replaces legacy mesh steel. */
  reinforcement?: FootingRebarSet[] | undefined;
  /** Strap beam concrete is extra to the two pads, with no steel assumed. */
  strapLengthFeet: number;
  strapWidthIn: number;
  strapDepthIn: number;
  pedestal: boolean;
  pedestalsPerGroup: number;
  pedestalWidthIn: number;
  pedestalDepthIn: number;
  pedestalHeightFeet: number;
  pedestalTieDia: number;
  pedestalTieSpacingIn: number;
};

export const newFootingType = (number: number): DesignFootingType => ({
  label: 'F' + (number + 1),
  type: 'isolated',
  count: 0,
  columnRefs: '',
  lengthFeet: 0,
  widthFeet: 0,
  thicknessIn: 12,
  padsPerGroup: 1,
  geometry: 'flat',
  topLengthFeet: 0,
  topWidthFeet: 0,
  stepThicknessIn: 0,
  edgeThicknessIn: 0,
  mesh: 'single',
  bottomBarDia: 12,
  bottomSpacingIn: 6,
  topBarDia: 12,
  topSpacingIn: 6,
  strapLengthFeet: 0,
  strapWidthIn: 0,
  strapDepthIn: 0,
  pedestal: false,
  pedestalsPerGroup: 1,
  pedestalWidthIn: 0,
  pedestalDepthIn: 0,
  pedestalHeightFeet: 0,
  pedestalTieDia: 8,
  pedestalTieSpacingIn: 6,
});

const safe = (value: number) =>
  Number.isFinite(value) ? Math.max(0, value) : 0;
export const padCount = (footing: DesignFootingType) =>
  footing.count *
  (footing.type === 'strap' ? Math.max(2, footing.padsPerGroup) : 1);

/** Returns cubic feet; concrete dimensions are design measurements, not defaults. */
export function footingConcreteCft(f: DesignFootingType): number {
  const n = padCount(f);
  const area = safe(f.lengthFeet) * safe(f.widthFeet);
  const totalThickness = safe(f.thicknessIn) / 12;
  if (!n || !area || !totalThickness) return 0;
  let perPad = area * totalThickness;
  if (f.geometry === 'stepped') {
    perPad +=
      (safe(f.topLengthFeet) * safe(f.topWidthFeet) * safe(f.stepThicknessIn)) /
      12;
  } else if (f.geometry === 'sloped') {
    const edge = Math.min(totalThickness, safe(f.edgeThicknessIn) / 12);
    const topLength = Math.min(f.lengthFeet, safe(f.topLengthFeet));
    const topWidth = Math.min(f.widthFeet, safe(f.topWidthFeet));
    const upperHeight = totalThickness - edge;
    const midLength = (f.lengthFeet + topLength) / 2;
    const midWidth = (f.widthFeet + topWidth) / 2;
    // Prismoidal approximation for a tapered rectangular footing.
    perPad =
      area * edge +
      (upperHeight * (area + 4 * midLength * midWidth + topLength * topWidth)) /
        6;
  }
  const strap =
    f.type === 'strap'
      ? ((((safe(f.strapLengthFeet) * safe(f.strapWidthIn)) / 12) *
          safe(f.strapDepthIn)) /
          12) *
        safe(f.count)
      : 0;
  return perPad * n + strap;
}

export function pedestalConcreteCft(f: DesignFootingType): number {
  if (!f.pedestal) return 0;
  return (
    ((((safe(f.count) * safe(f.pedestalsPerGroup) * safe(f.pedestalWidthIn)) /
      12) *
      safe(f.pedestalDepthIn)) /
      12) *
    safe(f.pedestalHeightFeet)
  );
}
export type FootingMeshPiece = {
  diameter: number;
  pieces: number;
  lengthFeet: number;
  layer: 'bottom' | 'top';
};
/** Two perpendicular reinforcement directions, per explicitly selected mesh layer. */
/**
 * Bars in a mesh across `acrossFeet` at `spacingFeet` centres: the spaces are
 * rounded UP so the drawn spacing is never exceeded (a 5 ft footing less
 * cover at 6" c/c needs 11 bars, not 10 at 6.45" c/c).
 */
export function barsAcross(acrossFeet: number, spacingFeet: number): number {
  if (!(acrossFeet > 0 && spacingFeet > 0)) return 0;
  return Math.ceil(acrossFeet / spacingFeet - 1e-9) + 1;
}

export function footingMeshPieces(
  f: DesignFootingType,
  coverFeet: number,
): FootingMeshPiece[] {
  const pieces: FootingMeshPiece[] = [];
  const n = padCount(f);
  if (!n || !f.lengthFeet || !f.widthFeet) return [];
  for (const layer of (f.mesh === 'double'
    ? ['bottom', 'top']
    : ['bottom']) as ('bottom' | 'top')[]) {
    const dia = layer === 'bottom' ? f.bottomBarDia : f.topBarDia;
    const spacing =
      (layer === 'bottom' ? f.bottomSpacingIn : f.topSpacingIn) / 12;
    if (!(dia > 0 && spacing > 0)) continue;
    const usableLength = Math.max(0, f.lengthFeet - 2 * coverFeet);
    const usableWidth = Math.max(0, f.widthFeet - 2 * coverFeet);
    for (const [span, across] of [
      [usableLength, usableWidth],
      [usableWidth, usableLength],
    ] as const) {
      if (!(span > 0 && across > 0)) continue;
      // Bottom bars are bent up at both ends inside the cover, as drawn on
      // footing sections (and as the quotation-structure takeoff counts).
      const bendUp =
        layer === 'bottom'
          ? Math.max(0, f.thicknessIn / 12 - 2 * coverFeet)
          : 0;
      pieces.push({
        diameter: dia,
        pieces: n * barsAcross(across, spacing),
        lengthFeet: span + 2 * bendUp,
        layer,
      });
    }
  }
  return pieces;
}
