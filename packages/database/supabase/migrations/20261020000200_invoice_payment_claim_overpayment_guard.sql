-- Prevent concurrent office approvals from recording more verified bank credit
-- than the request or the issued sales invoice permits.
begin;
create or replace function public.invoice_payment_claim_review(
 p_org uuid,p_claim uuid,p_approve boolean,p_bank_credit_confirmed boolean,p_notes text default ''
) returns void language plpgsql security definer set search_path='' as $body$
declare
 v_claim private.invoice_payment_claims;
 v_request private.invoice_payment_requests;
 v_doc private.gst_business_documents;
 v_request_verified numeric;
 v_invoice_verified numeric;
begin
 perform private.finance_require(p_org,'payment.manage');
 select * into v_claim from private.invoice_payment_claims
 where organization_id=p_org and id=p_claim and status='submitted';
 if not found then
  raise exception 'Claim unavailable or already reviewed' using errcode='22023';
 end if;
 select * into v_request from private.invoice_payment_requests
 where organization_id=p_org and id=v_claim.request_id;
 if not found then raise exception 'Payment request unavailable' using errcode='22023'; end if;
 -- Lock the invoice before calculating aggregates to serialize reviews across requests.
 select * into v_doc from private.gst_business_documents
 where organization_id=p_org and id=v_request.invoice_id
 and kind='sales_invoice' and status='issued' for update;
 if not found then raise exception 'Issued invoice unavailable' using errcode='22023'; end if;
 select * into v_claim from private.invoice_payment_claims
 where organization_id=p_org and id=p_claim and status='submitted' for update;
 if not found then raise exception 'Claim already reviewed' using errcode='22023'; end if;
 if p_approve is null or (p_approve and p_bank_credit_confirmed is distinct from true)
 or length(coalesce(p_notes,''))>1000 then
  raise exception 'Explicit bank credit confirmation required' using errcode='22023';
 end if;
 if p_approve then
  select coalesce(sum(amount),0) into v_request_verified
  from private.invoice_payment_claims
  where organization_id=p_org and request_id=v_request.id and status='verified';
  select coalesce(sum(c.amount),0) into v_invoice_verified
  from private.invoice_payment_claims c
  join private.invoice_payment_requests r on r.id=c.request_id and r.organization_id=c.organization_id
  where c.organization_id=p_org and r.invoice_id=v_doc.id and c.status='verified';
  if v_request_verified+v_claim.amount>v_request.amount
  or v_invoice_verified+v_claim.amount>v_doc.total then
   raise exception 'Verified payment would exceed the request or invoice balance'
   using errcode='22023';
  end if;
 end if;
 update private.invoice_payment_claims set
 status=case when p_approve then 'verified' else 'rejected' end,
 reviewed_by=auth.uid(),reviewed_at=now(),review_notes=coalesce(p_notes,'')
 where id=p_claim and organization_id=p_org;
 insert into public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id)
 values(auth.uid(),p_org,case when p_approve then 'invoice.payment_claim.verified'
 else 'invoice.payment_claim.rejected' end,'invoice_payment_claim',p_claim::text);
end; $body$;
commit;
