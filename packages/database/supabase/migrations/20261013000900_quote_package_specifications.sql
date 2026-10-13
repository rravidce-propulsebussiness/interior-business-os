-- Versioned floor/work schedules and editable package specifications may
-- exceed the legacy 3k encoded description cap. Enlarge only the bounded
-- customer-facing description field; no RLS, grants or audit rules change.
begin;
alter table public.quotation_items
  drop constraint if exists quotation_items_description_check;
alter table public.quotation_items
  add constraint quotation_items_description_check
  check (length(description) <= 14000);
commit;
