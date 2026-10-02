begin;
alter table public.invoices add constraint finite_invoice_dates check(isfinite(issue_date) and (due_date is null or isfinite(due_date)));
alter table public.payments add constraint finite_payment_date check(isfinite(payment_date));
alter table public.payment_schedule_items add constraint finite_milestone_date check(due_date is null or isfinite(due_date));
alter table public.payment_requests add constraint finite_request_date check(due_date is null or isfinite(due_date));
create function private.contract_source_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if not exists(select 1 from public.quotation_revisions r join public.quotations q on q.id=r.quotation_id join public.quotation_customer_responses a on a.revision_id=r.id where r.organization_id=new.organization_id and r.id=new.revision_id and r.project_id=new.project_id and q.customer_id=new.customer_id and a.id=new.acceptance_id and a.action='approved' and a.accepted_amount::numeric=new.original_contract_value::numeric and a.currency=new.currency and r.currency=new.currency and new.original_contract_value::numeric=(r.totals->>'final_amount')::numeric and r.status='issued' and q.status='issued') then raise exception 'Contract must match exact accepted quotation' using errcode='23514';end if;
 return new;
end$$;
create trigger contract_source_guard before insert on public.contracts for each row execute function private.contract_source_guard();
revoke all on function private.contract_source_guard() from public,anon,authenticated;
commit;
