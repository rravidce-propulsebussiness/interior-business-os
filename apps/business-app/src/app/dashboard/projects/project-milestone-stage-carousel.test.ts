import { describe, expect, it } from 'vitest';
import {
  cardScrollLeft,
  nearestCardIndex,
} from './project-milestone-stage-carousel';

// Geometry measured on the live 39-stage project: cards are narrower than the
// viewport and offsets are measured from an outer container.
function viewport(scrollLeft: number) {
  const cards = Array.from({ length: 39 }, (_, index) => ({
    offsetLeft: 263 + index * 1070,
  }));
  return {
    children: {
      length: cards.length,
      item: (index: number) => cards[index] ?? null,
    },
    clientWidth: 1090,
    scrollWidth: 41750,
    scrollLeft,
  } as unknown as HTMLElement;
}

describe('stage carousel position', () => {
  it('scrolls a card to the viewport start regardless of the outer offset', () => {
    expect(cardScrollLeft(viewport(0), 0)).toBe(0);
    expect(cardScrollLeft(viewport(0), 37)).toBe(37 * 1070);
  });

  it('selects the last card (handover) at the scroll end', () => {
    expect(nearestCardIndex(viewport(40660))).toBe(38);
  });

  it('selects the nearest card while scrolling', () => {
    expect(nearestCardIndex(viewport(0))).toBe(0);
    expect(nearestCardIndex(viewport(37 * 1070 + 100))).toBe(37);
    expect(nearestCardIndex(viewport(5 * 1070 - 200))).toBe(5);
  });
});
