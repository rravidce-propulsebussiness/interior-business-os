# Project execution: Phase 7 implementation contract

Phase 7 extends the existing Project, project areas, accepted Contract, approved execution estimate, Vendor and procurement records. Commercial values remain under Phase 5 change-order rules. No stock or site action reprices a quotation or closes financial records.

Plans have immutable approved revision snapshots and a separate physical lifecycle. Work packages, milestones and tasks form one schedule, with configurable exact decimal task weights. Progress is the sum of non-cancelled task weight times completion divided by total non-cancelled task weight; empty schedules report zero. Dependencies prevent cycles and unfinished predecessors block task completion. Assignment requires an active organization member with project access. Site access is limited to explicit project assignments; global access is an independent permission.

Inventory uses accepted-receipt lots and immutable signed ledger entries. One stock transaction owns all its legs. Transfers and issues atomically move a lot between locations. Consumption, return, scrap and damage are explicit transactions. Balances are sums of ledger quantities, never editable current-quantity fields. Organization locking serializes stock transactions and a database guard rejects negative balances. Source receipt costs stay in separately protected rows; exact numeric proportional allocation follows the receipt lot, including transfers. No currency conversion or inventory accounting ledger is introduced.

Only accepted material receipt quantities enter usable stock, exactly once per receipt line. Services and rejected quantities do not enter inventory. Receipt posting requires an explicit destination; earlier receipts are not silently assigned to a store. Historical receipt and PO records remain unchanged. Requests can be partially approved and issued; remaining demand is retained. Returns reference the original issue and are bounded by issued quantity and usable site stock. Corrections append reversing transactions and retain all originals.

Vendor records represent subcontractors through an extension rather than another party master. Issued work orders freeze scope and agreed costs. Measurements and certifications preserve history, have separate cost access and never create payments. Configurable inspection templates freeze into inspection checklists. Reinspection creates a successor record. Snag state changes append history. Handover checks tasks, material accounting, final inspection, unresolved snags and explicit document/commercial review. Completion is physically distinct from commercial closure.

The requested example of receiving 100, issuing 30, consuming 20, returning 5 and scrapping 2 yields store 75 and site 3. The contradictory expected 70/13 is not used. Planned waste, actual consumption, scrap, damage and variance remain separate facts.

Private attachments, stock reservation, customer self-service acknowledgement and all Phase 8 features remain deferred. Staff may record acknowledgement evidence without claiming a qualified electronic signature. New PDFs reuse the existing protected Chromium infrastructure.

PHASE7-VERIFICATION.md records completed local checks and known limitations. Hosted acceptance and full authenticated browser workflows remain pending; local SQL tests do not establish hosted acceptance.
