-- Unified platform invoice design + tenant-scoped GST working paper exports.
-- No changes to issued document amounts or historical appearance snapshots.
-- These exports are accountant working papers, NOT GSTN/GSTR filing submissions.
begin;

create table private.gst_invoice_standard (
 id boolean primary key default true check(id),
 template_id uuid not null references private.gst_invoice_templates(id),
 name text not null,
 config jsonb not null check(jsonb_typeof(config)='object' and octet_length(config::text)<=6000),
 updated_at timestamptz not null default now()
);
alter table private.gst_invoice_standard enable row level security;
revoke all on private.gst_invoice_standard from public,anon,authenticated;
create trigger gst_invoice_standard_touch before update on private.gst_invoice_standard
 for each row execute function private.touch_updated_at();

-- A single shared format for BOTH outgoing tax invoices and incoming supplier bills.
insert into private.gst_invoice_standard(id,template_id,name,config)
 select true,id,name,config from private.gst_invoice_templates
 where name='Modern Invoice' and kind='sales_invoice' and status='active'
 order by created_at,id limit 1;

do $$ begin
 if not exists(select 1 from private.gst_invoice_standard) then
   raise exception 'Seeded Modern Invoice layout is required' using errcode='22023';
 end if;
end $$;

create function public.gst_standard_invoice_format(p_org uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
begin
 if p_org is null then
   perform private.require_platform('platform.catalog.view');
 else
   perform private.finance_require(p_org,'invoice.view');
 end if;
 return (select jsonb_build_object('templateId',template_id,'name',name,'config',config)
         from private.gst_invoice_standard where id=true);
end $fn$;

create function public.gst_standard_invoice_select(p_template_id uuid)
returns void language plpgsql security definer set search_path='' as $fn$
declare t private.gst_invoice_templates;
begin
 perform private.require_platform('platform.entitlements.manage');
 select * into t from private.gst_invoice_templates
 where id=p_template_id and status='active';
 if not found then raise exception 'Choose an active invoice format' using errcode='22023';end if;
 update private.gst_invoice_standard
 set template_id=t.id,name=t.name,config=t.config where id=true;
 insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,metadata)
 values(auth.uid(),'gst.standard.changed','gst_invoice_template',t.id::text,
 jsonb_build_object('name',t.name));
end $fn$;

-- Editing the selected template updates the platform's standard automatically.
-- All issued invoices keep their independent appearance snapshots.
create function private.gst_standard_follow_template()
returns trigger language plpgsql security definer set search_path='' as $fn$
begin
 update private.gst_invoice_standard set name=new.name,config=new.config
 where id=true and template_id=new.id;
 return new;
end $fn$;
create trigger gst_standard_follow_template after update of name,config
 on private.gst_invoice_templates for each row
 execute function private.gst_standard_follow_template();

-- Never let the only selected standard be archived.
create function private.gst_standard_block_archive()
returns trigger language plpgsql security definer set search_path='' as $fn$
begin
 if new.status='inactive' and old.status is distinct from new.status
    and exists(select 1 from private.gst_invoice_standard where template_id=new.id) then
  raise exception 'Choose another standard before archiving this layout' using errcode='22023';
 end if;
 return new;
end $fn$;
create trigger gst_standard_block_archive before update of status
 on private.gst_invoice_templates for each row execute function private.gst_standard_block_archive();

-- A trigger covers ALL invoice creation paths, including the existing
-- authorized gst_document_save RPC. Tenant users cannot bypass appearance
-- controls by using an older client or calling the legacy function.
create function private.gst_assign_standard_on_invoice_insert()
returns trigger language plpgsql security definer set search_path='' as $fn$
begin
 insert into private.gst_invoice_document_layouts(document_id,template_id,template_name,config)
 select new.id,template_id,name,config
 from private.gst_invoice_standard where id=true;
 if not found then
   raise exception 'Standard invoice format unavailable' using errcode='22023';
 end if;
 return new;
end $fn$;
create trigger gst_assign_standard_on_invoice_insert
 after insert on private.gst_business_documents for each row
 execute function private.gst_assign_standard_on_invoice_insert();

-- Old draft records without a format receive the standard when finalized.
-- Existing issued/recorded documents with no layout remain untouched.
create function private.gst_assign_standard_on_finalize()
returns trigger language plpgsql security definer set search_path='' as $fn$
begin
 if old.status='draft' and new.status in ('issued','recorded')
   and not exists(select 1 from private.gst_invoice_document_layouts
                  where document_id=new.id) then
   insert into private.gst_invoice_document_layouts(document_id,template_id,template_name,config)
   select new.id,template_id,name,config
   from private.gst_invoice_standard where id=true;
   if not found then
     raise exception 'Standard invoice format unavailable' using errcode='22023';
   end if;
 end if;
 return new;
end $fn$;
create trigger gst_assign_standard_on_finalize
 after update of status on private.gst_business_documents for each row
 execute function private.gst_assign_standard_on_finalize();

-- Retain signature for compatibility but ignore tenant-supplied template IDs:
-- the server enforces a single platform-approved design for all new invoices.
create or replace function public.gst_document_with_template_save(
 p_org uuid,p_input jsonb,p_template_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $fn$
begin
 -- The AFTER INSERT trigger assigns the standard on every code path.
 -- Edits to existing drafts and issued historical snapshots keep the
 -- layout initially captured for that document.
 return public.gst_document_save(p_org,p_input);
end $fn$;

-- Scoped readout of finalized tax records. Drafts are excluded. Buyers can
-- only export their OWN purchase bills; a seller's shared marketplace invoice
-- remains accessible solely in the incoming register.
create function public.gst_filing_workpaper(
 p_org uuid,p_from date,p_to date,p_kind text default 'sales_invoice')
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare v_count integer; v_rows jsonb;
begin
 perform private.finance_require(p_org,'invoice.view');
 if p_from is null or p_to is null or p_to<p_from
    or p_to>p_from+interval '366 days'
    or p_kind not in ('sales_invoice','purchase_bill') then
    raise exception 'Choose a valid filing period and document kind' using errcode='22023';
 end if;
 select count(*) into v_count from private.gst_business_documents d
 where d.organization_id=p_org and d.kind=p_kind
 and d.status=case when p_kind='sales_invoice' then 'issued' else 'recorded' end
 and d.document_date between p_from and p_to;
 if v_count>5000 then
   raise exception 'More than 5000 documents; split the export into shorter periods' using errcode='22023';
 end if;
 select coalesce(jsonb_agg(
   jsonb_build_object(
     'number',d.number,'kind',d.kind,'documentType',d.document_type,
     'date',d.document_date,'placeOfSupply',d.place_of_supply,
     'partyName',d.party_name,'partyGstin',d.party_gstin,'partyState',d.party_state_code,
     'supplierName',d.snapshot#>>'{issuer,name}',
     'supplierGstin',d.snapshot#>>'{issuer,gstin}',
     'reverseCharge',d.reverse_charge,
     'taxable',d.taxable,'cgst',d.cgst,'sgst',d.sgst,'igst',d.igst,
     'discount',d.discount,'total',d.total,'lines',d.lines)
   order by d.document_date,d.number,d.id),'[]'::jsonb)
 into v_rows
 from private.gst_business_documents d
 where d.organization_id=p_org and d.kind=p_kind
 and d.status=case when p_kind='sales_invoice' then 'issued' else 'recorded' end
 and d.document_date between p_from and p_to;
 return v_rows;
end $fn$;

revoke all on function
 public.gst_standard_invoice_format(uuid),
 public.gst_standard_invoice_select(uuid),
 public.gst_filing_workpaper(uuid,date,date,text)
 from public,anon;
grant execute on function
 public.gst_standard_invoice_format(uuid),
 public.gst_standard_invoice_select(uuid),
 public.gst_filing_workpaper(uuid,date,date,text)
 to authenticated;
commit;
