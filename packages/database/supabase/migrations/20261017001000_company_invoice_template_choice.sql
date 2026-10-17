-- Company-owned choice of an existing platform-approved sales invoice design.
-- No duplicate invoice template catalog; issued document snapshots do not change.
begin;
create table private.gst_company_template_choices (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  template_id uuid not null references private.gst_invoice_templates(id),
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now()
);
alter table private.gst_company_template_choices enable row level security;
revoke all on private.gst_company_template_choices from public,anon,authenticated;
create function public.gst_company_template_select(p_org uuid,p_template_id uuid)
returns void language plpgsql security definer set search_path='' as $fn$
begin
  perform private.finance_require(p_org,'billing.manage');
  if not exists (
    select 1 from private.gst_invoice_templates
    where id=p_template_id and status='active' and kind='sales_invoice'
  ) then raise exception 'Choose an active sales invoice template' using errcode='22023';end if;
  insert into private.gst_company_template_choices(organization_id,template_id,updated_by)
    values(p_org,p_template_id,auth.uid())
    on conflict(organization_id) do update set
      template_id=excluded.template_id,updated_by=excluded.updated_by,updated_at=now();
  insert into public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id)
    values(auth.uid(),p_org,'gst.company.template.selected','gst_invoice_template',p_template_id::text);
end $fn$;
create or replace function public.gst_standard_invoice_format(p_org uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare v_selected jsonb;
begin
  if p_org is null then perform private.require_platform('platform.catalog.view');
  else perform private.finance_require(p_org,'invoice.view'); end if;
  if p_org is not null then
    select jsonb_build_object('templateId',t.id,'name',t.name,'config',t.config)
      into v_selected from private.gst_company_template_choices c
      join private.gst_invoice_templates t on t.id=c.template_id
      where c.organization_id=p_org and t.status='active' and t.kind='sales_invoice';
  end if;
  if v_selected is not null then return v_selected; end if;
  return (select jsonb_build_object('templateId',template_id,'name',name,'config',config)
          from private.gst_invoice_standard where id=true);
end $fn$;
-- The existing post-insert trigger is the shared source of new document designs.
create or replace function private.gst_assign_standard_on_invoice_insert()
returns trigger language plpgsql security definer set search_path='' as $fn$
declare v_template_id uuid;v_name text;v_config jsonb;
begin
  if new.kind='sales_invoice' then
    select t.id,t.name,t.config into v_template_id,v_name,v_config
    from private.gst_company_template_choices c
    join private.gst_invoice_templates t on t.id=c.template_id
    where c.organization_id=new.organization_id and t.status='active'
      and t.kind='sales_invoice';
  end if;
  if v_template_id is not null then
    insert into private.gst_invoice_document_layouts(document_id,template_id,template_name,config)
      values(new.id,v_template_id,v_name,v_config);
  else
    insert into private.gst_invoice_document_layouts(document_id,template_id,template_name,config)
      select new.id,template_id,name,config from private.gst_invoice_standard where id=true;
    if not found then raise exception 'Standard invoice template unavailable' using errcode='22023';end if;
  end if;
  return new;
end $fn$;
revoke all on function public.gst_company_template_select(uuid,uuid) from public,anon;
grant execute on function public.gst_company_template_select(uuid,uuid) to authenticated;
commit;
