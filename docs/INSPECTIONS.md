# Inspections: Phase 7

Organization-configured templates contain bounded checklist items with stable keys, labels and required flags. An inspection snapshots its template. Approval records a passed, failed or requires-rework result with actor and time; finalized records reject edits and deletion. Passing requires the required checks to pass. Reinspection creates a successor to the latest failed inspection.

Forms support template configuration, inspection creation, checklist results and approval. Reinspection retains the original frozen requirements even if its template changes. Approved inspection PDFs use historical snapshots. Local tests cover failure, reinspection, passing, handover gates and competing approvals; hosted browser acceptance remains pending.
