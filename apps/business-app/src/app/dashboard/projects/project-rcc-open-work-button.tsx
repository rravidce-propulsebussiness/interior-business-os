'use client';

export function OpenRccWorkButton({ targetId }: { targetId: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        const target = document.getElementById(targetId);
        if (!target) return;
        let parent = target.parentElement;
        while (parent) {
          if (parent instanceof HTMLDetailsElement) parent.open = true;
          parent = parent.parentElement;
        }
        target.scrollIntoView({
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)')
            .matches
            ? 'auto'
            : 'smooth',
          block: 'start',
        });
      }}
    >
      Open
    </button>
  );
}
