'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode, UIEvent } from 'react';

export function ProjectMilestoneStageCarousel({
  children,
  currentIndex,
  todayIndex,
  stageTitles,
}: {
  children: ReactNode;
  currentIndex: number;
  todayIndex: number;
  stageTitles: string[];
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(currentIndex);
  const lastIndex = Math.max(0, stageTitles.length - 1);

  const setSelectedStage = (viewport: HTMLDivElement, index: number) => {
    Array.from(viewport.children).forEach((child, childIndex) => {
      if (child instanceof HTMLDetailsElement) {
        child.open = childIndex === index;
        child.classList.toggle('is-current', childIndex === index);
      }
    });
  };

  const goTo = useCallback(
    (index: number, behavior: ScrollBehavior = 'smooth') => {
      const next = Math.max(0, Math.min(lastIndex, index));
      const viewport = viewportRef.current;
      const card = viewport?.children.item(next) as HTMLElement | null;
      if (!viewport || !card) return;
      viewport.scrollTo({ left: card.offsetLeft, behavior });
      setSelectedStage(viewport, next);
      setSelectedIndex(next);
    },
    [lastIndex],
  );

  useEffect(() => {
    goTo(currentIndex, 'auto');
  }, [currentIndex, goTo]);

  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    const viewport = event.currentTarget;
    if (!viewport.clientWidth) return;
    const next = Math.max(
      0,
      Math.min(
        lastIndex,
        Math.round(viewport.scrollLeft / viewport.clientWidth),
      ),
    );
    setSelectedStage(viewport, next);
    setSelectedIndex((selected) => (selected === next ? selected : next));
  };

  if (!stageTitles.length) return null;

  return (
    <div className="pmt-stage-carousel">
      <div className="pmt-stage-carousel-controls">
        <div
          className="pmt-stage-carousel-current"
          role="status"
          aria-live="polite"
        >
          <small>
            Stage {selectedIndex + 1} of {stageTitles.length}
          </small>
          <strong>{stageTitles[selectedIndex]}</strong>
          {selectedIndex === todayIndex ? (
            <span className="is-today">Today’s stage</span>
          ) : selectedIndex === currentIndex ? (
            <span>Current stage</span>
          ) : null}
        </div>
        <div className="pmt-stage-carousel-buttons">
          <button
            type="button"
            aria-label="Previous stage"
            onClick={() => goTo(selectedIndex - 1)}
            disabled={selectedIndex <= 0}
          >
            <span aria-hidden="true">←</span>
          </button>
          <button
            type="button"
            aria-label="Next stage"
            onClick={() => goTo(selectedIndex + 1)}
            disabled={selectedIndex >= lastIndex}
          >
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
      <div
        className="pmt-stage-carousel-viewport"
        ref={viewportRef}
        onScroll={onScroll}
        role="group"
        aria-label="Swipe through project stages"
      >
        {children}
      </div>
    </div>
  );
}
