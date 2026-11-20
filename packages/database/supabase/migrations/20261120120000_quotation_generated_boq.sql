begin;

-- One quotation-generated construction BOQ per project quotation revision.
-- Generation runs on every idempotent quote -> project handoff; this index
-- makes concurrent handoffs safe. Manual BOQs (no generator) are unaffected.
create unique index construction_boq_documents_quote_generated
  on public.construction_boq_documents (organization_id, project_id, quotation_revision_id)
  where document ? 'generator';

commit;
