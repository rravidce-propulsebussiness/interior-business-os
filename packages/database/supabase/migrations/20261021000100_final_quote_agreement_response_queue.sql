-- Customer-response reminders must follow the same Final quotation decision
-- shown on the quotations page, not every historical issued revision.
-- A recorded, current signed agreement closes the response reminder even
-- when the client did not separately click an online "Approve" button.
BEGIN;

CREATE OR REPLACE FUNCTION public.quotation_response_queue(
  p_organization_id uuid,
  p_status text DEFAULT '',
  p_project_id uuid DEFAULT NULL,
  p_page integer DEFAULT 1
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $queue$
DECLARE
  v_total bigint;
  v_rows jsonb;
BEGIN
  IF NOT private.commercial_access(
       p_organization_id, 'quotation.customer_response.view', 'quotation'
     ) OR NOT private.has_permission(p_organization_id, 'quotation.view')
  THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_page NOT BETWEEN 1 AND 10000
    OR p_status NOT IN ('', 'awaiting', 'approved', 'changes_requested', 'declined')
  THEN
    RAISE EXCEPTION 'Invalid filter' USING ERRCODE = '22023';
  END IF;

  WITH selected_final AS (
    -- Keep in sync with public.quotation_final_choices: a manually pinned
    -- quotation is Final only until a newer quotation is created.
    SELECT COALESCE(
      CASE WHEN pinned.id IS NOT NULL
                 AND sel.selected_at >= newest.created_at
           THEN pinned.id END,
      newest.id
    ) AS quotation_id
    FROM public.customers customer
    JOIN LATERAL (
      SELECT q.id, q.created_at
      FROM public.quotations q
      WHERE q.organization_id = p_organization_id
        AND q.customer_id = customer.id
        AND q.status IN ('draft', 'issued')
      ORDER BY q.created_at DESC, q.id DESC
      LIMIT 1
    ) newest ON true
    LEFT JOIN private.quotation_final_selections sel
      ON sel.organization_id = p_organization_id
     AND sel.customer_id = customer.id
    LEFT JOIN public.quotations pinned
      ON pinned.organization_id = p_organization_id
     AND pinned.id = sel.quotation_id
     AND pinned.customer_id = customer.id
     AND pinned.status IN ('draft', 'issued')
    WHERE customer.organization_id = p_organization_id
  ),
  eligible AS (
    SELECT
      revision.id,
      q.quotation_number,
      revision.revision_number,
      revision.project_id,
      revision.document_snapshot #>> '{project,name}' AS project_name,
      COALESCE(response.action, 'awaiting') AS response_status,
      response.customer_name,
      response.comment,
      response.responded_at,
      response.accepted_amount,
      response.currency,
      revision.issued_at AS sort_issued_at
    FROM selected_final final
    JOIN public.quotations q
      ON q.organization_id = p_organization_id
     AND q.id = final.quotation_id
     AND q.status = 'issued'
    -- Superseded revisions are historical: only the Final quote's current
    -- issued revision can require a customer decision.
    JOIN public.quotation_revisions revision
      ON revision.organization_id = q.organization_id
     AND revision.id = q.current_revision_id
     AND revision.quotation_id = q.id
     AND revision.status = 'issued'
    LEFT JOIN public.quotation_customer_responses response
      ON response.organization_id = revision.organization_id
     AND response.revision_id = revision.id
    WHERE (p_project_id IS NULL OR revision.project_id = p_project_id)
      AND (p_status = '' OR COALESCE(response.action, 'awaiting') = p_status)
      AND NOT EXISTS (
        -- An owner-recorded signed agreement is the customer acceptance
        -- evidence. The source revision can belong to a retired sales
        -- prospect even though the contract belongs to the active project.
        SELECT 1
        FROM public.contracts contract
        WHERE contract.organization_id = p_organization_id
          AND contract.customer_id = q.customer_id
          AND contract.revision_id = revision.id
          AND contract.status IN ('pending', 'active', 'on_hold')
          AND EXISTS (
            SELECT 1
            FROM private.project_agreement_events agreement_event
            WHERE agreement_event.organization_id = contract.organization_id
              AND agreement_event.project_id = contract.project_id
              AND agreement_event.contract_id = contract.id
              AND agreement_event.event_kind = 'signed_copy_recorded'
              AND agreement_event.scope_fingerprint =
                  private.project_agreement_scope(contract.id)
              AND agreement_event.sequence = (
                SELECT MAX(latest.sequence)
                FROM private.project_agreement_events latest
                WHERE latest.organization_id = contract.organization_id
                  AND latest.project_id = contract.project_id
                  AND latest.contract_id = contract.id
              )
          )
      )
  )
  SELECT
    (SELECT count(*) FROM eligible),
    COALESCE((
      SELECT jsonb_agg(to_jsonb(page_row) - 'sort_issued_at'
                       ORDER BY page_row.sort_issued_at DESC NULLS LAST,
                                page_row.id)
      FROM (
        SELECT *
        FROM eligible
        ORDER BY sort_issued_at DESC NULLS LAST, id
        LIMIT 25 OFFSET (p_page - 1) * 25
      ) page_row
    ), '[]'::jsonb)
  INTO v_total, v_rows;

  RETURN jsonb_build_object('rows', v_rows, 'total', v_total, 'page', p_page);
END;
$queue$;

REVOKE ALL ON FUNCTION public.quotation_response_queue(uuid, text, uuid, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.quotation_response_queue(uuid, text, uuid, integer)
  TO authenticated;

COMMIT;
