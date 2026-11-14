'use client';

type Props = {
  checkTargetId?: string | undefined;
  checkProgress?: string | undefined;
  qcTargetId?: string | undefined;
  qcProgress?: string | undefined;
};

function openReview(targetId: string) {
  const target = document.getElementById(targetId);
  if (!target) return;

  let parent = target.parentElement;
  while (parent) {
    if (parent instanceof HTMLDetailsElement) parent.open = true;
    parent = parent.parentElement;
  }
  const disclosure =
    target.querySelector<HTMLDetailsElement>('details.pv2-item-checklist') ??
    target.querySelector<HTMLDetailsElement>('details.pv2-on-site-qc') ??
    (target instanceof HTMLDetailsElement ? target : null);
  if (disclosure) disclosure.open = true;
  const qcItem = target.querySelector<HTMLDetailsElement>(
    'details.pv2-qc-item',
  );
  if (qcItem) qcItem.open = true;
  target.scrollIntoView({
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'auto'
      : 'smooth',
    block: 'start',
  });
}

export function ProjectStageReviewActions({
  checkTargetId,
  checkProgress,
  qcTargetId,
  qcProgress,
}: Props) {
  if (!checkTargetId && !qcTargetId) return null;

  return (
    <nav className="pv2-stage-review-actions" aria-label="Stage checks and QC">
      {checkTargetId && (
        <button type="button" onClick={() => openReview(checkTargetId)}>
          Site checks <span>{checkProgress}</span>
        </button>
      )}
      {qcTargetId && (
        <button type="button" onClick={() => openReview(qcTargetId)}>
          Company QC <span>{qcProgress}</span>
        </button>
      )}
    </nav>
  );
}
