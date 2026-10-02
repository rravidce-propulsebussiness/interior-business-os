# Inventory: Phase 7

Usable stock is the sum of immutable signed movements by organization, receipt lot and location. A transaction groups every leg of receipt, transfer, site issue, return, consumption, scrap, damage, adjustment, count or reversal. Organization locking serializes writes; a database guard rejects a negative lot/location balance. There is no authoritative editable current-quantity field.

Only accepted material receipt quantities may be posted. Rejected quantities and services do not become stock. Posting requires an explicit destination and one receipt lot per receipt item. Retry keys bind the command to its original payload. An issue requires an approved matching project/material/unit request. Returns refer to their original issue. Corrections append a reversal rather than editing history.

Cost basis is source receipt cost allocated from the issued PO line, retained in a separate cost table. Transfers preserve the receipt lot. Quantities and monetary values use exact decimal text at API boundaries and PostgreSQL numeric arithmetic. These are operational costs, not accounting expenses.

The stock page is `/dashboard/operations/stock`. Command forms cover accepted receipt posting, requests and approvals, partial issues, transfers, linked returns, consumption, scrap, damage, counts, adjustments and reversals. Reference selectors are searchable and paginated. Independent database sessions exercise competing receipt posting, transfer, issue, consumption and adjustment commands. Protected movement and material-issue PDFs are available from transaction details. See PHASE7-VERIFICATION.md for verification limits.
