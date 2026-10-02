begin;
alter table public.material_issue_request_items drop constraint material_issue_request_items_check;
alter table public.material_issue_request_items add constraint material_issue_approval_quantity check(case when approved_quantity is null then true else private.execution_decimal(approved_quantity)>=0 and approved_quantity::numeric<=quantity::numeric end);
commit;
