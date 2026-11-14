'use client';

import { useState } from 'react';

export function ProjectTimelineExpandControl() {
  const [expanded, setExpanded] = useState(false);
  return (
    <button
      type="button"
      className="pmt-expand-control"
      aria-controls="project-timeline"
      aria-expanded={expanded}
      onClick={() => {
        const root = document.getElementById('project-timeline');
        if (!root) return;
        const next = !expanded;
        root.querySelectorAll<HTMLDetailsElement>(':scope > details.pmt-stage').forEach((stage) => {
          stage.open = next;
        });
        setExpanded(next);
      }}
    >
      {expanded ? 'Collapse all' : 'Expand all'}
    </button>
  );
}
