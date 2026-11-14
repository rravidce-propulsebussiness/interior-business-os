'use client';

import { useEffect, useRef, type ReactNode } from 'react';

export function ProjectMilestoneStageList({
  children,
  focusIndex,
}: {
  children: ReactNode;
  focusIndex: number;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = listRef.current?.children.item(focusIndex) as HTMLDetailsElement | null;
    if (!stage) return;
    stage.open = true;
    const frame = window.requestAnimationFrame(() => {
      stage.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusIndex]);

  return <div className="pmt-stage-list" ref={listRef}>{children}</div>;
}
