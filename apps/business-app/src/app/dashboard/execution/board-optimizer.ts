import type { CutlistPanel } from './interior-cutlist';

export type BoardSize = {
  key: string;
  label: string;
  length: number;
  width: number;
};
export type BoardPlacement = {
  id: string;
  sourcePanelId: string;
  board: number;
  x: number;
  y: number;
  length: number;
  width: number;
  rotated: boolean;
  code: string;
  label: string;
};
export type BoardLayout = {
  board: number;
  placements: BoardPlacement[];
  usedArea: number;
  wasteArea: number;
  wastePercent: number;
};

export const BOARD_SIZES: readonly BoardSize[] = [
  { key: '2440x1220', label: '8 × 4 ft board', length: 2440, width: 1220 },
  { key: '2440x1830', label: '8 × 6 ft board', length: 2440, width: 1830 },
  { key: '2750x1830', label: '9 × 6 ft board', length: 2750, width: 1830 },
];

type Shelf = { y: number; height: number; used: number };
type WorkingBoard = { shelves: Shelf[]; placements: BoardPlacement[] };
const area = (length: number, width: number) => length * width;

/** Rotation-aware largest-first nesting with trim and saw-kerf allowances. */
export function optimizeBoardLayout(
  panels: readonly CutlistPanel[],
  board: BoardSize,
  trim = 10,
  kerf = 3,
): BoardLayout[] {
  const usableLength = Math.max(0, board.length - trim * 2);
  const usableWidth = Math.max(0, board.width - trim * 2);
  const boards: WorkingBoard[] = [];
  const pieces = panels.flatMap((panel) =>
    Array.from({ length: Math.max(0, panel.quantity) }, (_, copy) => ({
      panel,
      copy,
      area: area(panel.length, panel.width),
    })),
  );
  pieces.sort((a, b) => b.area - a.area);
  const orientations = (length: number, width: number) => [
    { length, width, rotated: false },
    ...(length === width
      ? []
      : [{ length: width, width: length, rotated: true }]),
  ];

  for (const piece of pieces) {
    let placed = false;
    for (
      let boardIndex = 0;
      boardIndex < boards.length && !placed;
      boardIndex += 1
    ) {
      const target = boards[boardIndex]!;
      for (const shelf of target.shelves) {
        for (const orientation of orientations(
          piece.panel.length,
          piece.panel.width,
        )) {
          if (
            orientation.length + shelf.used <= usableLength &&
            orientation.width <= shelf.height
          ) {
            target.placements.push({
              id: `${piece.panel.id}-${piece.copy}`,
              sourcePanelId: piece.panel.id,
              board: boardIndex + 1,
              x: trim + shelf.used,
              y: trim + shelf.y,
              length: orientation.length,
              width: orientation.width,
              rotated: orientation.rotated,
              code: piece.panel.code,
              label: piece.panel.panel,
            });
            shelf.used += orientation.length + kerf;
            placed = true;
            break;
          }
        }
        if (placed) break;
      }
      if (placed) continue;
      const y = target.shelves.reduce(
        (max, shelf) => Math.max(max, shelf.y + shelf.height + kerf),
        0,
      );
      for (const orientation of orientations(
        piece.panel.length,
        piece.panel.width,
      )) {
        if (
          orientation.length <= usableLength &&
          y + orientation.width <= usableWidth
        ) {
          target.shelves.push({
            y,
            height: orientation.width,
            used: orientation.length + kerf,
          });
          target.placements.push({
            id: `${piece.panel.id}-${piece.copy}`,
            sourcePanelId: piece.panel.id,
            board: boardIndex + 1,
            x: trim,
            y: trim + y,
            length: orientation.length,
            width: orientation.width,
            rotated: orientation.rotated,
            code: piece.panel.code,
            label: piece.panel.panel,
          });
          placed = true;
          break;
        }
      }
    }
    if (!placed) {
      const next: WorkingBoard = { shelves: [], placements: [] };
      boards.push(next);
      const created = orientations(piece.panel.length, piece.panel.width).find(
        (orientation) =>
          orientation.length <= usableLength &&
          orientation.width <= usableWidth,
      );
      if (!created) continue;
      next.shelves.push({
        y: 0,
        height: created.width,
        used: created.length + kerf,
      });
      next.placements.push({
        id: `${piece.panel.id}-${piece.copy}`,
        sourcePanelId: piece.panel.id,
        board: boards.length,
        x: trim,
        y: trim,
        length: created.length,
        width: created.width,
        rotated: created.rotated,
        code: piece.panel.code,
        label: piece.panel.panel,
      });
    }
  }

  const boardArea = area(board.length, board.width);
  return boards.map((entry, index) => {
    const usedArea = entry.placements.reduce(
      (sum, placement) => sum + area(placement.length, placement.width),
      0,
    );
    const wasteArea = Math.max(0, boardArea - usedArea);
    return {
      board: index + 1,
      placements: entry.placements,
      usedArea,
      wasteArea,
      wastePercent: boardArea ? (wasteArea / boardArea) * 100 : 0,
    };
  });
}
