-- Platform-managed visual templates for GST sales invoices and supplier bills.
-- Quotations are intentionally excluded: they have their own client-share workflow.
-- Each document stores its own presentation snapshot; issued records never reflow
-- when the platform changes or retires a template.
begin;

create table private.gst_invoice_templates (
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(btrim(name)) between 3 and 90),
 kind text not null check(kind in ('sales_invoice','purchase_bill')),
 status text not null default 'active' check(status in ('active','inactive')),
 config jsonb not null check(jsonb_typeof(config)='object' and octet_length(config::text)<=6000),
 created_by uuid references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table private.gst_invoice_document_layouts (
 document_id uuid primary key references private.gst_business_documents(id),
 template_id uuid references private.gst_invoice_templates(id) on delete set null,
 template_name text not null check(length(template_name)<=90),
 config jsonb not null check(jsonb_typeof(config)='object' and octet_length(config::text)<=6000),
 updated_at timestamptz not null default now()
);

alter table private.gst_invoice_templates enable row level security;
alter table private.gst_invoice_document_layouts enable row level security;
revoke all on private.gst_invoice_templates,private.gst_invoice_document_layouts
 from public,anon,authenticated;

create trigger gst_invoice_template_touch before update on private.gst_invoice_templates
 for each row execute function private.touch_updated_at();
create trigger gst_invoice_document_layout_touch before update on private.gst_invoice_document_layouts
 for each row execute function private.touch_updated_at();

-- Seed layouts, NOT fabricated sales, clients, invoice numbers or GST values.
insert into private.gst_invoice_templates(name,kind,config)
values
 ('Modern Invoice','sales_invoice',
  '{"layout":"modern","accent":"#2563eb","subtitle":"Professional billing","footer":"Thank you for your business.","showUnit":true,"showDiscount":true,"blankRows":1,"customFields":[]}'::jsonb),
 ('Corporate Invoice','sales_invoice',
  '{"layout":"classic","accent":"#0f172a","subtitle":"Goods and services invoice","footer":"Please retain this invoice for your records.","showUnit":true,"showDiscount":true,"blankRows":2,"customFields":[]}'::jsonb),
 ('Premium Invoice','sales_invoice',
  '{"layout":"modern","accent":"#0d9488","subtitle":"Crafted for your business","footer":"We appreciate the opportunity to serve you.","showUnit":true,"showDiscount":false,"blankRows":3,"customFields":[]}'::jsonb),
 ('Minimal Invoice','sales_invoice',
  '{"layout":"minimal","accent":"#475569","subtitle":"","footer":"","showUnit":false,"showDiscount":true,"blankRows":1,"customFields":[]}'::jsonb),
 ('Supplier Bill — Classic','purchase_bill',
  '{"layout":"classic","accent":"#c07816","subtitle":"Supplier purchase register","footer":"Recorded against the original supplier document.","showUnit":true,"showDiscount":true,"blankRows":2,"customFields":[]}'::jsonb),
 ('Purchase Invoice — Clean','purchase_bill',
  '{"layout":"minimal","accent":"#7c3aed","subtitle":"Materials and services received","footer":"Verify supplier invoice details before recording.","showUnit":true,"showDiscount":true,"blankRows":1,"customFields":[]}'::jsonb);

create function public.gst_template_list(p_org uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
begin
 if p_org is null then
   perform private.require_platform('platform.catalog.view');
 else
   perform private.finance_require(p_org,'invoice.view');
 end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
   'id',t.id,'name',t.name,'kind',t.kind,'status',t.status,'config',t.config)
   order by t.kind,t.name)
   from private.gst_invoice_templates t
   where p_org is null or t.status='active'),'[]'::jsonb);
end $fn$;

create function public.gst_template_save(p_input jsonb)
returns uuid language plpgsql security definer set search_path='' as $fn$
declare v_id uuid;v_name text;v_kind text;v_config jsonb;v_extra jsonb;
begin
 perform private.require_platform('platform.entitlements.manage');
 if jsonb_typeof(p_input) is distinct from 'object'
   or (p_input-array['id','name','kind','config']) <> '{}'::jsonb then
   raise exception 'Invalid template payload' using errcode='22023';
 end if;
 v_name=btrim(coalesce(p_input->>'name',''));
 v_kind=p_input->>'kind';
 v_config=p_input->'config';
 if length(v_name) not between 3 and 90
   or v_kind not in ('sales_invoice','purchase_bill')
   or jsonb_typeof(v_config) is distinct from 'object'
   or octet_length(v_config::text)>6000
   or (v_config-array['layout','accent','subtitle','footer','showUnit','showDiscount','blankRows','customFields']) <> '{}'::jsonb
   or coalesce(v_config->>'layout','') not in ('modern','classic','minimal')
   or coalesce(v_config->>'accent','') !~ '^#[0-9A-Fa-f]{6}$'
   or length(coalesce(v_config->>'subtitle',''))>120
   or length(coalesce(v_config->>'footer',''))>400
   or jsonb_typeof(v_config->'showUnit') is distinct from 'boolean'
   or jsonb_typeof(v_config->'showDiscount') is distinct from 'boolean'
   or jsonb_typeof(v_config->'blankRows') is distinct from 'number'
   or (v_config->>'blankRows')::integer not between 1 and 10
   or jsonb_typeof(v_config->'customFields') is distinct from 'array'
   or jsonb_array_length(v_config->'customFields')>5 then
   raise exception 'Invalid template style/fields' using errcode='22023';
 end if;
 for v_extra in select * from jsonb_array_elements(v_config->'customFields') loop
   if jsonb_typeof(v_extra) is distinct from 'object'
    or (v_extra-array['label','value'])<>'{}'::jsonb
    or length(btrim(coalesce(v_extra->>'label',''))) not between 1 and 50
    or length(coalesce(v_extra->>'value',''))>120 then
     raise exception 'Invalid custom template field' using errcode='22023';
   end if;
 end loop;
 if nullif(p_input->>'id','') is null then
   insert into private.gst_invoice_templates(name,kind,config,created_by)
     values(v_name,v_kind,v_config,auth.uid()) returning id into v_id;
 else
   v_id=(p_input->>'id')::uuid;
   update private.gst_invoice_templates set name=v_name,config=v_config
     where id=v_id and kind=v_kind;
   if not found then raise exception 'Template not found or kind changed' using errcode='22023';end if;
 end if;
 insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,metadata)
 values(auth.uid(),'gst.template.saved','gst_invoice_template',v_id::text,
   jsonb_build_object('kind',v_kind));
 return v_id;
end $fn$;

create function public.gst_template_set_status(p_id uuid,p_active boolean)
returns void language plpgsql security definer set search_path='' as $fn$
begin
 perform private.require_platform('platform.entitlements.manage');
 update private.gst_invoice_templates set status=case when p_active then 'active' else 'inactive' end
 where id=p_id;
 if not found then raise exception 'Template unavailable' using errcode='22023';end if;
 insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,
 metadata) values(auth.uid(),'gst.template.status','gst_invoice_template',p_id::text,
 jsonb_build_object('active',p_active));
end $fn$;

-- Transactionally persist the selected appearance with the draft document.
-- The original GST calculation/validation RPC remains the financial authority.
create function public.gst_document_with_template_save(
 p_org uuid,p_input jsonb,p_template_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $fn$
declare v_id uuid;v_template private.gst_invoice_templates;v_kind text;
begin
 v_kind=p_input->>'kind';
 if p_template_id is not null then
   select * into v_template from private.gst_invoice_templates
   where id=p_template_id and status='active' and kind=v_kind;
   if not found then raise exception 'Select an active template for this document type' using errcode='22023';end if;
 end if;
 v_id=public.gst_document_save(p_org,p_input);
 if p_template_id is not null then
   insert into private.gst_invoice_document_layouts(document_id,template_id,template_name,config)
    values(v_id,p_template_id,v_template.name,v_template.config)
   on conflict(document_id) do update set template_id=excluded.template_id,
     template_name=excluded.template_name,config=excluded.config;
 end if;
 return v_id;
end $fn$;

create function public.gst_document_layout(p_org uuid,p_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare v_document private.gst_business_documents;
begin
 perform private.finance_require(p_org,'invoice.view');
 select * into v_document from private.gst_business_documents
 where id=p_id and (
 organization_id=p_org or (counterparty_organization_id=p_org and status='issued'));
 if not found then raise exception 'Document unavailable' using errcode='42501';end if;
 return (select jsonb_build_object('templateId',t.template_id,
 'name',t.template_name,'config',t.config) from private.gst_invoice_document_layouts t
 where t.document_id=p_id);
end $fn$;

revoke all on function
 public.gst_template_list(uuid),public.gst_template_save(jsonb),
 public.gst_template_set_status(uuid,boolean),
 public.gst_document_with_template_save(uuid,jsonb,uuid),
 public.gst_document_layout(uuid,uuid)
 from public,anon;
grant execute on function
 public.gst_template_list(uuid),public.gst_template_save(jsonb),
 public.gst_template_set_status(uuid,boolean),
 public.gst_document_with_template_save(uuid,jsonb,uuid),
 public.gst_document_layout(uuid,uuid)
 to authenticated;

commit;
