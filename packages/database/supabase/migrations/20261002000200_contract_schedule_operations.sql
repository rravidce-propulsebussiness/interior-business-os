begin;
create function public.finance_configure(p_organization_id uuid,p_entity text,p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$declare target uuid;prior jsonb;allowed text[];cols text;assignments text;k text;begin
 perform private.finance_require(p_organization_id,'billing.manage');
 if p_entity is null or p_entity not in ('organization_billing_settings','payment_methods','tax_codes') or jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>20000 then raise exception 'Invalid configuration' using errcode='22023';end if;
 target=coalesce((p_input->>'id')::uuid,gen_random_uuid());
 execute format('select to_jsonb(t) from public.%I t where organization_id=$1 and id=$2',p_entity) into prior using p_organization_id,target;
 if prior is null and p_input ? 'id' then raise exception 'Unavailable configuration' using errcode='42501';end if;
 if prior is not null and (prior->>'version')::integer is distinct from (p_input->>'version')::integer then raise exception 'Stale configuration' using errcode='40001';end if;
 allowed=case p_entity when 'organization_billing_settings' then array['legal_name','billing_address','tax_identifier','invoice_prefix','receipt_prefix','contract_prefix','default_terms','payment_instructions','invoice_notes','receipt_footer'] when 'payment_methods' then array['name','kind','active'] else array['code','jurisdiction','components','active'] end;
 for k in select jsonb_object_keys(p_input) loop if k not in ('id','version') and not k=any(allowed) then raise exception 'Invalid configuration field' using errcode='22023';end if;end loop;
 p_input=p_input-'id'-'version';
 select string_agg(format('%I',key),',' order by key),string_agg(format('%I=r.%I',key,key),',' order by key) into cols,assignments from jsonb_object_keys(p_input) key;
 if cols is null then raise exception 'Empty configuration' using errcode='22023';end if;
 if prior is null then execute format('insert into public.%1$I(id,organization_id,%2$s) select $1,$2,%2$s from jsonb_populate_record(null::public.%1$I,$3)',p_entity,cols) using target,p_organization_id,p_input;
 else execute format('update public.%1$I t set %2$s,version=t.version+1 from jsonb_populate_record(null::public.%1$I,$3) r where t.id=$1 and t.organization_id=$2',p_entity,assignments) using target,p_organization_id,p_input;end if;
 if p_entity='tax_codes' and coalesce((p_input->>'active')::boolean,true) then perform private.finance_tax_components(p_organization_id,target);end if;
 perform private.crm_audit(p_organization_id,'billing.configuration_updated',p_entity,target);return target;
end$$;
create function public.contract_create(p_organization_id uuid,p_revision_id uuid) returns uuid language plpgsql security definer set search_path='' as $$declare r public.quotation_revisions;q public.quotations;a public.quotation_customer_responses;p public.projects;target uuid;prefix text;value numeric;places integer;begin
 perform private.finance_require(p_organization_id,'contract.create');
 if not private.commercial_access(p_organization_id,'quotation.view','quotation') or not private.has_permission(p_organization_id,'quotation.customer_response.view') or not private.has_permission(p_organization_id,'project.view') then raise exception 'Forbidden' using errcode='42501';end if;
 select id into target from public.contracts where organization_id=p_organization_id and revision_id=p_revision_id;
 if target is not null then return target;end if;
 select * into r from public.quotation_revisions where organization_id=p_organization_id and id=p_revision_id for update;
 select * into q from public.quotations where organization_id=p_organization_id and id=r.quotation_id;
 select * into a from public.quotation_customer_responses where organization_id=p_organization_id and revision_id=r.id and action='approved';
 select * into p from public.projects where organization_id=p_organization_id and id=r.project_id;
 if r.id is null or r.status<>'issued' or q.status<>'issued' or a.id is null or a.accepted_amount is distinct from r.totals->>'final_amount' or a.currency<>r.currency then raise exception 'Customer-approved issued revision required' using errcode='22023';end if;
 value=private.finance_decimal(a.accepted_amount);places=greatest(2,scale(trim_scale(value)));
 if places>6 then raise exception 'Unsupported accepted precision' using errcode='22023';end if;
 select contract_prefix into prefix from public.organization_billing_settings where organization_id=p_organization_id;
 insert into public.contracts(organization_id,customer_id,project_id,revision_id,acceptance_id,lead_id,branch_id,contract_number,currency,precision,original_contract_value,source_snapshot,accepted_at)
 values(p_organization_id,q.customer_id,q.project_id,r.id,a.id,(select (array_agg(id order by created_at,id))[1] from public.leads where organization_id=p_organization_id and converted_project_id=p.id having count(*)=1),p.branch_id,private.finance_number(p_organization_id,'contract',coalesce(prefix,'CT')),r.currency,places,a.accepted_amount,private.customer_quote_projection(r.id),a.responded_at) returning id into target;
 perform private.crm_audit(p_organization_id,'contract.created','contracts',target);return target;
end$$;
create function public.contract_transition(p_organization_id uuid,p_id uuid,p_version integer,p_status text,p_reason text default '') returns uuid language plpgsql security definer set search_path='' as $$declare c public.contracts;begin
 perform private.finance_require(p_organization_id,'contract.manage');select * into c from public.contracts where organization_id=p_organization_id and id=p_id for update;
 if c.id is null then raise exception 'Unavailable contract' using errcode='42501';end if;
 if c.status=p_status then return c.id;end if;
 if c.version is distinct from p_version then raise exception 'Stale contract' using errcode='40001';end if;
 if p_status is null or not ((c.status='pending' and p_status in ('active','cancelled')) or (c.status='active' and p_status in ('on_hold','completed','cancelled')) or (c.status='on_hold' and p_status in ('active','cancelled')) or (c.status='completed' and p_status in ('active','closed'))) then raise exception 'Invalid contract transition' using errcode='22023';end if;
 if p_status in ('on_hold','cancelled','closed') and length(trim(p_reason))<3 then raise exception 'Reason required' using errcode='22023';end if;
 if p_status='cancelled' and (exists(select 1 from public.invoices where contract_id=c.id and status='issued') or exists(select 1 from public.payments where contract_id=c.id and status='recorded') or exists(select 1 from public.change_orders where contract_id=c.id and status='approved') or exists(select 1 from public.payment_requests where contract_id=c.id and status='issued')) then raise exception 'Resolve commercial documents before cancellation' using errcode='22023';end if;
 if p_status='closed' and (
 exists(select 1 from public.invoices i where contract_id=c.id and status='issued' and invoice_type='tax_invoice' and total::numeric<>private.invoice_paid(i.id)) or
 exists(select 1 from public.payments p where contract_id=c.id and status='recorded' and amount::numeric<>private.payment_allocated(p.id)) or
 coalesce((select sum(total::numeric) from public.invoices where contract_id=c.id and status='issued' and invoice_type='tax_invoice'),0)<>private.contract_value(c.id) or
 exists(select 1 from public.change_orders where contract_id=c.id and status in ('draft','issued')) or exists(select 1 from public.invoices where contract_id=c.id and status='draft')) then raise exception 'Unresolved commercial balances or drafts' using errcode='22023';end if;
 update public.contracts set status=p_status,version=version+1,status_reason=p_reason,started_at=case when p_status='active' then coalesce(started_at,now()) else started_at end,completed_at=case when p_status='completed' then now() else completed_at end,closed_at=case when p_status='closed' then now() else closed_at end,cancelled_at=case when p_status='cancelled' then now() else cancelled_at end where id=c.id;
 perform private.crm_audit(p_organization_id,'contract.'||p_status,'contracts',c.id);return c.id;
end$$;
create function public.payment_schedule_save(p_organization_id uuid,p_contract_id uuid,p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$declare c public.contracts;s public.payment_schedules;x jsonb;target uuid;basis numeric;amount numeric;allocated numeric=0;percent numeric=0;ordinal integer=0;remaining_seen boolean=false;begin
 perform private.finance_require(p_organization_id,'payment_schedule.manage');select * into c from public.contracts where organization_id=p_organization_id and id=p_contract_id for update;
 if c.id is null or c.status in ('closed','cancelled') then raise exception 'Unavailable contract' using errcode='42501';end if;
 if jsonb_typeof(p_input->'items') is distinct from 'array' or jsonb_array_length(p_input->'items') not between 1 and 200 or octet_length(p_input::text)>200000 then raise exception 'Invalid schedule' using errcode='22023';end if;
 basis=private.contract_value(c.id);
 if p_input->>'id' is not null then select * into s from public.payment_schedules where organization_id=p_organization_id and contract_id=c.id and id=(p_input->>'id')::uuid for update;
 if s.id is null or s.status<>'draft' or s.version is distinct from (p_input->>'version')::integer then raise exception 'Stale schedule' using errcode='40001';end if;
 target=s.id;delete from public.payment_schedule_items where schedule_id=s.id;
 update public.payment_schedules set label=p_input->>'label',basis_value=trim_scale(basis)::text,version=version+1 where id=s.id;
 else insert into public.payment_schedules(organization_id,contract_id,label,basis_value,supersedes_id) values(p_organization_id,c.id,p_input->>'label',trim_scale(basis)::text,(p_input->>'supersedes_id')::uuid) returning id into target;end if;
 for x in select jsonb_array_elements(p_input->'items') loop
 if remaining_seen then raise exception 'Remaining balance must be last' using errcode='22023';end if;
 if x->>'calculation_type'='percentage' then percent=percent+private.finance_decimal(x->>'value');amount=round(basis*private.finance_decimal(x->>'value')/100,c.precision);
 elsif x->>'calculation_type'='fixed' then amount=private.finance_decimal(x->>'value');
 elsif x->>'calculation_type'='remaining' then
 if private.finance_decimal(x->>'value')<>0 then raise exception 'Remaining value must be zero' using errcode='22023';end if;
 amount=basis-allocated-coalesce((select sum(i.expected_amount::numeric) from public.payment_schedule_items i join public.payment_schedules ps on ps.id=i.schedule_id where ps.contract_id=c.id and ps.status='active' and ps.id is distinct from (p_input->>'supersedes_id')::uuid),0);remaining_seen=true;
 else raise exception 'Invalid schedule type' using errcode='22023';end if;
 if amount<0 or round(amount,c.precision)<>amount or percent>100 then raise exception 'Invalid schedule allocation' using errcode='22023';end if;
 allocated=allocated+amount;
 insert into public.payment_schedule_items(organization_id,contract_id,schedule_id,label,description,calculation_type,value,expected_amount,due_trigger,due_date,sort_order) values(p_organization_id,c.id,target,x->>'label',coalesce(x->>'description',''),x->>'calculation_type',x->>'value',trim_scale(amount)::text,coalesce(x->>'due_trigger',''),(x->>'due_date')::date,ordinal);ordinal=ordinal+1;
 end loop;
 if allocated>basis then raise exception 'Schedule over-allocation' using errcode='22023';end if;
 perform private.crm_audit(p_organization_id,'payment_schedule.saved','payment_schedules',target);return target;
end$$;
create function public.payment_schedule_activate(p_organization_id uuid,p_id uuid,p_version integer) returns uuid language plpgsql security definer set search_path='' as $$declare s public.payment_schedules;c public.contracts;allocated numeric;begin
 perform private.finance_require(p_organization_id,'payment_schedule.manage');select * into s from public.payment_schedules where organization_id=p_organization_id and id=p_id for update;
 if s.id is null then raise exception 'Unavailable schedule' using errcode='42501';end if;
 if s.status='active' then return s.id;end if;
 select * into c from public.contracts where id=s.contract_id for update;
 if s.status<>'draft' or s.version is distinct from p_version or c.status in ('closed','cancelled') or s.basis_value::numeric<>private.contract_value(c.id) then raise exception 'Stale schedule or contract value' using errcode='40001';end if;
 if s.supersedes_id is not null then
 if not exists(select 1 from public.payment_schedules where id=s.supersedes_id and status='active') or exists(select 1 from public.payment_schedule_items i where schedule_id=s.supersedes_id and (exists(select 1 from public.payment_requests where schedule_item_id=i.id) or exists(select 1 from public.invoice_items where source_type='milestone' and source_id=i.id))) then raise exception 'Referenced milestones cannot be rewritten' using errcode='22023';end if;
 update public.payment_schedules set status='superseded',version=version+1 where id=s.supersedes_id;end if;
 select coalesce(sum(i.expected_amount::numeric),0) into allocated from public.payment_schedule_items i join public.payment_schedules ps on ps.id=i.schedule_id where ps.contract_id=c.id and (ps.status='active' or ps.id=s.id);
 if allocated>private.contract_value(c.id) then raise exception 'Schedule over-allocation' using errcode='22023';end if;
 update public.payment_schedules set status='active',activated_at=now(),version=version+1 where id=s.id;
 perform private.crm_audit(p_organization_id,'payment_schedule.activated','payment_schedules',s.id);return s.id;
end$$;
create function public.payment_request_issue(p_organization_id uuid,p_item_id uuid,p_due_date date default null,p_note text default '') returns uuid language plpgsql security definer set search_path='' as $$declare i public.payment_schedule_items;target uuid;n text;snapshot jsonb;begin
 perform private.finance_require(p_organization_id,'payment_request.create');
 select i0.* into i from public.payment_schedule_items i0 join public.payment_schedules s on s.id=i0.schedule_id join public.contracts c on c.id=i0.contract_id where i0.organization_id=p_organization_id and i0.id=p_item_id and s.status='active' and c.status not in ('closed','cancelled');
 if i.id is null or i.expected_amount::numeric<=0 then raise exception 'Unavailable milestone' using errcode='42501';end if;
 select id into target from public.payment_requests where schedule_item_id=i.id and status='issued';if target is not null then return target;end if;
 n=private.finance_number(p_organization_id,'payment_request','PR');snapshot=private.finance_header(i.contract_id)||jsonb_build_object('kind','payment_request','number',n,'date',current_date,'due_date',coalesce(p_due_date,i.due_date),'notes',p_note,'terms','','total',i.expected_amount,'lines',jsonb_build_array(jsonb_build_object('description',i.label,'quantity','1','unit','milestone','rate',i.expected_amount,'amount',i.expected_amount)));
 insert into public.payment_requests(organization_id,contract_id,schedule_item_id,request_number,amount,due_date,note,document_snapshot) values(p_organization_id,i.contract_id,i.id,n,i.expected_amount,coalesce(p_due_date,i.due_date),p_note,snapshot) returning id into target;
 perform private.crm_audit(p_organization_id,'payment_request.issued','payment_requests',target);return target;
end$$;
revoke all on function public.finance_configure(uuid,text,jsonb),public.contract_create(uuid,uuid),public.contract_transition(uuid,uuid,integer,text,text),public.payment_schedule_save(uuid,uuid,jsonb),public.payment_schedule_activate(uuid,uuid,integer),public.payment_request_issue(uuid,uuid,date,text) from public,anon;
grant execute on function public.finance_configure(uuid,text,jsonb),public.contract_create(uuid,uuid),public.contract_transition(uuid,uuid,integer,text,text),public.payment_schedule_save(uuid,uuid,jsonb),public.payment_schedule_activate(uuid,uuid,integer),public.payment_request_issue(uuid,uuid,date,text) to authenticated;
commit;
