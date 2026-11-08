-- PostgREST runs STABLE RPCs in a read-only transaction.
-- These list RPCs use require_permission(), which locks the organization row.
-- Mark only the affected reads VOLATILE so the existing lock and permission
-- checks remain active while the RPC executes in a writable transaction.
begin;

alter function public.company_employee_list(uuid) volatile;
alter function public.company_employee_attendance_list(uuid, date) volatile;
alter function public.quotation_package_list(uuid) volatile;

commit;
