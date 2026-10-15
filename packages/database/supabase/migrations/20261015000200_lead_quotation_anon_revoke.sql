-- Supabase may grant EXECUTE on new public functions directly to anon.
-- Explicitly revoke direct anonymous access to tenant-sensitive RPCs.
begin;
revoke all on function public.lead_quotation_link(uuid,uuid,uuid,uuid) from anon, public;
revoke all on function public.lead_quotation_list(uuid,uuid) from anon, public;
revoke all on function public.lead_quotation_summary(uuid,uuid[]) from anon, public;
commit;
