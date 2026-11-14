'use client';

import { useEffect } from 'react';

/** Scroll the page to the stage scheduled for today when the project opens. */
export function ProjectMilestoneAutoScroll({ focusIndex }: { focusIndex: number }) {
  useEffect(() => {
    const stage = document.getElementById('project-stage-' + focusIndex);
    if (!stage) return;
    const frame = window.requestAnimationFrame(() => {
      stage.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusIndex]);

  return null;
}
