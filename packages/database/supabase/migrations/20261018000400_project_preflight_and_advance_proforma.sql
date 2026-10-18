-- A single pre-design site survey and one idempotent proforma advance
-- payment request per contract. Signed agreement is not a payment receipt.
begin;
create table private.project_preflight (
 organization_id uuid not null,
 project_id uuid not null,
 inspection_details text not null default '',
 measurement_details text not null default '',
 inspection_at timestamptz,
 measurement_at timestamptz,
 inspected_by uuid,
 measured_by uuid,
 updated_at timestamptz not null default now(),
 primary key(organization_id,project_id),
 foreign key(organization_id,project_id) references public.projects(organization_id,id)
);
create table private.project_advance_proformas (
 organization_id uuid not null,
 contract_id uuid not null,
 invoice_id uuid not null,
 advance_percent numeric not null check (advance_percent>0 and advance_percent<=100),
 created_at timestamptz not null default now(),
 primary key(organization_id,contract_id),
 unique(organization_id,invoice_id),
 foreign key(organization_id,contract_id) references public.contracts(organization_id,id),
 foreign key(organization_id,invoice_id) references public.invoices(organization_id,id)
);

create function public.project_preflight_read(p_org uuid,p_project uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $read$
declare v private.project_preflight;
begin
 if not private.site_access(p_org,p_project) then
  raise exception 'Project access required' using errcode='42501';
 end if;
 select * into v from private.project_preflight
  where organization_id=p_org and project_id=p_project;
 return jsonb_build_object('inspection_done',v.inspection_at is not null,
  'measurements_done',v.measurement_at is not null,
  'inspection_details',coalesce(v.inspection_details,''),
  'measurement_details',coalesce(v.measurement_details,''),
  'inspection_at',v.inspection_at,'measurement_at',v.measurement_at);
end $read$;

create function public.project_preflight_save(
 p_org uuid,p_project uuid,p_kind text,p_details text)
returns jsonb language plpgsql security definer set search_path='' as $save$
declare p public.projects;v private.project_preflight;
begin
 if not private.site_allowed(p_org,p_project,array['manager','site_engineer'])
 then raise exception 'Site engineer or project owner access required' using errcode='42501';end if;
 if p_kind not in ('inspection','measurements') or length(trim(coalesce(p_details,''))) not between 20 and 3000
 then raise exception 'Provide detailed site observations or measurements' using errcode='22023';end if;
 select * into p from public.projects where organization_id=p_org and id=p_project
   and status='active' and not is_sales_prospect and not removed_from_workspace;
 if p.id is null then raise exception 'Active delivery project not found' using errcode='42501';end if;
 if not exists (
   select 1 from public.contracts c
   join private.project_agreement_events ev on ev.organization_id=c.organization_id
     and ev.project_id=c.project_id and ev.contract_id=c.id
   where c.organization_id=p_org and c.project_id=p_project
    and c.status in ('pending','active','on_hold')
    and ev.event_kind='signed_copy_recorded'
    and ev.scope_fingerprint=private.project_agreement_scope(c.id)
    and ev.sequence=(select max(e2.sequence) from private.project_agreement_events e2
      where e2.organization_id=c.organization_id and e2.project_id=c.project_id
        and e2.contract_id=c.id)
 ) then raise exception 'Record signed agreement before site survey' using errcode='23514';end if;
 insert into private.project_preflight(organization_id,project_id) values(p_org,p_project)
 on conflict (organization_id,project_id) do nothing;
 if p_kind='inspection' then
  update private.project_preflight set inspection_details=trim(p_details),inspection_at=now(),
    inspected_by=auth.uid(),updated_at=now()
   where organization_id=p_org and project_id=p_project returning * into v;
 else
  update private.project_preflight set measurement_details=trim(p_details),measurement_at=now(),
    measured_by=auth.uid(),updated_at=now()
   where organization_id=p_org and project_id=p_project returning * into v;
 end if;
 perform private.crm_audit(p_org,'project.preflight.'||p_kind,'projects',p_project);
 return jsonb_build_object('inspection_done',v.inspection_at is not null,
  'measurements_done',v.measurement_at is not null);
end $save$;

create function public.project_advance_proforma_prepare(
 p_org uuid,p_project uuid,p_percent numeric)
returns uuid language plpgsql security definer set search_path='' as $advance$
declare c public.contracts;existing uuid;amount numeric;payload jsonb;created uuid;
begin
 perform private.finance_require(p_org,'invoice.create');
 perform private.finance_require(p_org,'invoice.manage');
 perform private.finance_require(p_org,'invoice.issue');
 if p_percent is null or p_percent<=0 or p_percent>100 or scale(p_percent)>2
 then raise exception 'Advance must be a percentage between 0.01 and 100' using errcode='22023';end if;
 if not private.site_owner(p_org)
 then raise exception 'Only the company owner can issue the initial advance proforma' using errcode='42501';end if;
 select * into c from public.contracts where organization_id=p_org and project_id=p_project
  and status in ('pending','active') order by created_at desc limit 1 for update;
 if c.id is null then raise exception 'Prepare the project agreement first' using errcode='42501';end if;
 if not exists(select 1 from private.project_agreement_events ev
    where ev.organization_id=p_org and ev.project_id=p_project and ev.contract_id=c.id
      and ev.event_kind='signed_copy_recorded'
      and ev.scope_fingerprint=private.project_agreement_scope(c.id)
      and ev.sequence=(select max(e2.sequence) from private.project_agreement_events e2
       where e2.organization_id=p_org and e2.project_id=p_project and e2.contract_id=c.id))
 then raise exception 'Record signed agreement before issuing advance request' using errcode='23514';end if;
 select invoice_id into existing from private.project_advance_proformas
  where organization_id=p_org and contract_id=c.id;
 if existing is not null then return existing;end if;
 amount=round(private.finance_decimal(c.original_contract_value)*p_percent/100,c.precision);
 if amount<=0 then raise exception 'Advance amount is too small' using errcode='22023';end if;
 payload=jsonb_build_object('invoice_type','proforma',
   'issue_date',to_char(current_date,'YYYY-MM-DD'),'due_date',null,
   'tax_mode','exclusive','tax_application','line','tax_code_id',null,
   'place_of_supply','','billing_state','',
   'notes','Advance payment request under signed agreement '||c.contract_number,
   'items',jsonb_build_array(jsonb_build_object(
     'description','Contract advance ('||trim_scale(p_percent)::text||'%)',
     'quantity','1','unit','each','unit_rate',trim_scale(amount)::text,
     'discount','0','tax_code_id',null,'hsn_sac','',
     'source_type','manual','source_id',null)));
 created=public.invoice_save(p_org,c.id,payload);
 perform public.invoice_issue(p_org,created,1);
 insert into private.project_advance_proformas(organization_id,contract_id,invoice_id,advance_percent)
 values(p_org,c.id,created,p_percent);
 perform private.crm_audit(p_org,'project.advance_proforma.issued','invoices',created);
 return created;
end $advance$;

revoke all on function public.project_preflight_read(uuid,uuid) from public,anon;
revoke all on function public.project_preflight_save(uuid,uuid,text,text) from public,anon;
revoke all on function public.project_advance_proforma_prepare(uuid,uuid,numeric) from public,anon;
grant execute on function public.project_preflight_read(uuid,uuid) to authenticated;
grant execute on function public.project_preflight_save(uuid,uuid,text,text) to authenticated;
grant execute on function public.project_advance_proforma_prepare(uuid,uuid,numeric) to authenticated;
create function public.project_advance_read(p_org uuid,p_project uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $read$
declare c public.contracts; i public.invoices; m private.project_advance_proformas;
 received numeric=0;
begin
 if not private.site_access(p_org,p_project)
   or not private.finance_access(p_org,'invoice.view')
 then raise exception 'Project finance access required' using errcode='42501';end if;
 select * into c from public.contracts where organization_id=p_org and project_id=p_project
 and status in ('pending','active','on_hold') order by created_at desc limit 1;
 if c.id is null then return jsonb_build_object('available',false,'received','0');end if;
 select * into m from private.project_advance_proformas
  where organization_id=p_org and contract_id=c.id;
 if m.invoice_id is not null then
  select * into i from public.invoices where organization_id=p_org and id=m.invoice_id;
 end if;
 select coalesce(sum(private.finance_decimal(amount)),0) into received
 from public.payments where organization_id=p_org and contract_id=c.id and status='recorded';
 return jsonb_build_object('available',true,'contract_id',c.id,
   'invoice_id',i.id,'invoice_number',i.invoice_number,'invoice_status',i.status,
   'invoice_total',coalesce(i.total,'0'),'advance_percent',m.advance_percent,
   'received',trim_scale(received)::text,
   'schedule_active',exists(select 1 from public.payment_schedules ps
     where ps.organization_id=p_org and ps.contract_id=c.id and ps.status='active'));
end $read$;

revoke all on function public.project_advance_read(uuid,uuid) from public,anon;
grant execute on function public.project_advance_read(uuid,uuid) to authenticated;

commit;
