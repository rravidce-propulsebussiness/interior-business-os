begin;
drop policy automation_read on public.communication_consents;
create policy automation_consent_read on public.communication_consents for select to authenticated using(private.has_permission(organization_id,'automation.manage') and private.commercial_access(organization_id,'customer.manage','customers'));
commit;
