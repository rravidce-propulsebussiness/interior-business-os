-- A rejected photo or mismatched screenshot is not proof of a received bank
-- credit. Permit re-submission of evidence for the SAME UTR after rejection,
-- but never permit two pending/approved claims for the same company and UTR.
BEGIN;
ALTER TABLE private.client_payment_proofs
 DROP CONSTRAINT IF EXISTS client_payment_proofs_organization_id_bank_reference_key;
CREATE UNIQUE INDEX IF NOT EXISTS client_payment_proofs_active_bank_reference_unique
 ON private.client_payment_proofs(organization_id,bank_reference)
 WHERE status IN ('pending','approved');
COMMIT;
