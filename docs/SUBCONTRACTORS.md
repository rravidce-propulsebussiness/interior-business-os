# Subcontractors: Phase 7

Subcontractors reuse Vendors through `vendor_execution_profiles`; there is no second party master. Work orders belong to an execution plan and preserve issued scope. Agreed prices and measured costs live in separate cost-protected tables. Progress, measurement, verification and certification are distinct operations. Measurement quantities cannot exceed remaining ordered work. Certification does not create an invoice or payment.

Protected forms support vendor execution profiles, draft work orders, issue/cancel/progress commands and measurement, verification and certification. Issued work-order PDFs use preserved snapshots. Local SQL tests cover proportional measurement cost, over-measurement rejection, certification, cancellation protection and completed progress. Hosted browser acceptance remains pending; see PHASE7-VERIFICATION.md.
