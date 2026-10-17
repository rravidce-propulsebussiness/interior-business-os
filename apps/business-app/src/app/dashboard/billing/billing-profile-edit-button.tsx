'use client';

export function BillingProfileEditButton() {
  return (
    <button
      type="button"
      className="billing-edit-link"
      aria-controls="billing-profile-edit"
      onClick={() => {
        const details = document.getElementById('billing-profile-edit');
        if (!(details instanceof HTMLDetailsElement)) return;
        details.open = true;
        details.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        details.querySelector('summary')?.focus({ preventScroll: true });
      }}
    >
      Edit
    </button>
  );
}
