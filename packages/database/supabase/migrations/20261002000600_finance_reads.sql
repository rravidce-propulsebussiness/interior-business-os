begin;
create function private.finance_read_permission(entity text) returns text language sql immutable set search_path='' as $$select case entity when 'contracts' then 'contract.view' when 'payment_schedules' then 'payment_schedule.view' when 'payment_schedule_items' then 'payment_schedule.view' when 'payment_requests' then 'payment_request.view' when 'invoices' then 'invoice.view' when 'invoice_items' then 'invoice.view' when 'payments' then 'payment.view' when 'payment_allocations' then 'payment.view' when 'receipts' then 'receipt.view' when 'change_orders' then 'change_order.view' when 'change_order_items' then 'change_order.view' when 'payment_methods' then 'payment.view' when 'tax_codes' then 'invoice.view' when 'organization_billing_settings' then 'billing.manage' end;$$;
create function private.finance_row(entity text,row_data jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$declare target uuid=(row_data->>'id')::uuid;org uuid=(row_data->>'organization_id')::uuid;paid numeric;amount numeric;status text;today date;begin
 select (now() at time zone default_timezone)::date into today from public.organizations where id=org;
 if entity='contracts' then return row_data||jsonb_build_object('current_contract_value',trim_scale(private.contract_value(target))::text,'customer_name',row_data#>>'{source_snapshot,header,customer,name}','project_name',row_data#>>'{source_snapshot,header,project,name}');
 elsif entity='invoices' then
 paid=private.invoice_paid(target);amount=(row_data->>'total')::numeric;status=row_data->>'status';
 if status='issued' then status=case when paid=amount then 'paid' when paid>0 then 'partially_paid' when (row_data->>'due_date')::date<today then 'overdue' else 'issued' end;end if;
 return row_data||jsonb_build_object('paid_amount',trim_scale(paid)::text,'balance',trim_scale(case when row_data->>'status'='void' then 0 else amount-paid end)::text,'effective_status',status,'overdue',row_data->>'status'='issued' and paid<amount and (row_data->>'due_date')::date<today);
 elsif entity='payments' then return row_data-'request_hash'||jsonb_build_object('allocated_amount',trim_scale(private.payment_allocated(target))::text,'unallocated_amount',trim_scale(case when row_data->>'status'='recorded' then (row_data->>'amount')::numeric-private.payment_allocated(target) else 0 end)::text,'receipt_id',(select id from public.receipts where payment_id=target));
 elsif entity in ('payment_requests','payment_schedule_items') then
 select coalesce(sum(private.invoice_paid(i.id)*l.total::numeric/nullif(i.total::numeric,0)),0) into paid from public.invoice_items l join public.invoices i on i.id=l.invoice_id where l.source_type='milestone' and l.source_id=case when entity='payment_requests' then (row_data->>'schedule_item_id')::uuid else target end and i.status='issued' and i.invoice_type='tax_invoice';
 amount=coalesce(row_data->>'amount',row_data->>'expected_amount')::numeric;
 return row_data||jsonb_build_object('effective_status',case when row_data->>'status'='void' then 'void' when paid>=amount and amount>0 then 'settled' when paid>0 then 'partially_paid' when (row_data->>'due_date')::date<today then 'overdue' else 'pending' end);
 end if;return row_data;
end$$;
create function public.finance_search(p_organization_id uuid,p_entity text,p_filter jsonb default '{}',p_page integer default 1) returns jsonb language plpgsql stable security definer set search_path='' as $$declare permission text;condition_sql text;label text;rows jsonb;total bigint;begin
 permission=private.finance_read_permission(p_entity);
 if permission is null or not private.finance_access(p_organization_id,permission) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_page is null or p_page not between 1 and 10000 or jsonb_typeof(p_filter) is distinct from 'object' or octet_length(p_filter::text)>4000 then raise exception 'Invalid finance search' using errcode='22023';end if;
 label=case p_entity when 'contracts' then 'contract_number' when 'invoices' then 'invoice_number' when 'payments' then 'payment_number' when 'payment_requests' then 'request_number' when 'receipts' then 'receipt_number' when 'change_orders' then 'change_order_number' when 'payment_schedules' then 'label' when 'payment_schedule_items' then 'label' when 'payment_methods' then 'name' when 'tax_codes' then 'code' when 'organization_billing_settings' then 'legal_name' else 'id' end;
 condition_sql=format('t.organization_id=$1 and ($2->>''q'' is null or starts_with(lower(coalesce(t.%I::text,'''')),lower($2->>''q''))) and ($2->>''id'' is null or t.id=($2->>''id'')::uuid) and ($2->>''from'' is null or t.created_at>=($2->>''from'')::date) and ($2->>''until'' is null or t.created_at<($2->>''until'')::date+1)',label);
 if p_entity not in ('payment_methods','tax_codes','organization_billing_settings') then
 condition_sql=condition_sql||case when p_entity='contracts' then ' and ($2->>''contract_id'' is null or t.id=($2->>''contract_id'')::uuid)' else ' and ($2->>''contract_id'' is null or t.contract_id=($2->>''contract_id'')::uuid)' end;
 condition_sql=condition_sql||case when p_entity='contracts' then ' and ($2->>''customer_id'' is null or t.customer_id=($2->>''customer_id'')::uuid) and ($2->>''project_id'' is null or t.project_id=($2->>''project_id'')::uuid) and ($2->>''branch_id'' is null or t.branch_id=($2->>''branch_id'')::uuid)' else ' and exists(select 1 from public.contracts c where c.id=t.contract_id and ($2->>''customer_id'' is null or c.customer_id=($2->>''customer_id'')::uuid) and ($2->>''project_id'' is null or c.project_id=($2->>''project_id'')::uuid) and ($2->>''branch_id'' is null or c.branch_id=($2->>''branch_id'')::uuid))' end;
 end if;
 if p_entity in ('contracts','invoices','payments','payment_schedules','payment_requests','receipts','change_orders') then condition_sql=condition_sql||' and ($2->>''status'' is null or t.status=$2->>''status'')';end if;
 if p_entity='contracts' then condition_sql=condition_sql||' and ($2->>''revision_id'' is null or t.revision_id=($2->>''revision_id'')::uuid)';end if;
 if p_entity in ('invoice_items','change_order_items','payment_schedule_items','payment_allocations') then condition_sql=condition_sql||format(' and ($2->>''parent_id'' is null or t.%I=($2->>''parent_id'')::uuid)',case p_entity when 'invoice_items' then 'invoice_id' when 'change_order_items' then 'change_order_id' when 'payment_schedule_items' then 'schedule_id' else 'payment_id' end);end if;
 execute format('select count(*) from public.%I t where %s',p_entity,condition_sql) into total using p_organization_id,p_filter;
 execute format('select coalesce(jsonb_agg(private.finance_row($4,to_jsonb(x))),''[]'') from (select t.* from public.%I t where %s order by t.created_at desc,t.id limit 25 offset $3)x',p_entity,condition_sql) into rows using p_organization_id,p_filter,(p_page-1)*25,p_entity;
 return jsonb_build_object('rows',rows,'total',total,'page',p_page);
end$$;
create function public.finance_detail(p_organization_id uuid,p_entity text,p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare permission text;data jsonb;lines jsonb;child text;parent text;begin
 permission=private.finance_read_permission(p_entity);if permission is null or not private.finance_access(p_organization_id,permission) then raise exception 'Forbidden' using errcode='42501';end if;
 execute format('select to_jsonb(t) from public.%I t where organization_id=$1 and id=$2',p_entity) into data using p_organization_id,p_id;
 if data is null then raise exception 'Unavailable record' using errcode='42501';end if;
 child=case p_entity when 'invoices' then 'invoice_items' when 'change_orders' then 'change_order_items' when 'payment_schedules' then 'payment_schedule_items' end;
 parent=case p_entity when 'invoices' then 'invoice_id' when 'change_orders' then 'change_order_id' when 'payment_schedules' then 'schedule_id' end;
 if child is not null then execute format('select coalesce(jsonb_agg(private.finance_row($3,to_jsonb(x))),''[]'') from (select * from public.%I where organization_id=$1 and %I=$2 order by sort_order limit 200)x',child,parent) into lines using p_organization_id,p_id,child;end if;
 return private.finance_row(p_entity,data)||jsonb_build_object('items',coalesce(lines,'[]'));
end$$;
create function public.finance_summary(p_organization_id uuid,p_contract_id uuid default null,p_customer_id uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not private.finance_access(p_organization_id,'financial_report.view') then raise exception 'Forbidden' using errcode='42501';end if;
 return coalesce((select jsonb_agg(x) from (
 select c.currency,trim_scale(sum(c.original_contract_value::numeric))::text original_contract_value,trim_scale(sum(private.contract_value(c.id)-c.original_contract_value::numeric))::text approved_change_order_value,trim_scale(sum(private.contract_value(c.id)))::text current_contract_value,
 trim_scale(sum(v.invoiced))::text invoiced_amount,trim_scale(sum(v.invoiced-v.allocated))::text outstanding_invoices,trim_scale(sum(v.collected))::text paid_amount,trim_scale(sum(v.collected-v.allocated))::text unallocated_advance,trim_scale(sum(private.contract_value(c.id)-v.invoiced))::text unbilled_contract_value,trim_scale(sum(v.overdue))::text overdue,trim_scale(sum(v.month_collected))::text payments_this_month,trim_scale(sum(private.contract_value(c.id)-v.scheduled))::text schedule_unallocated
 from public.contracts c cross join lateral (
 select coalesce((select sum(total::numeric) from public.invoices where contract_id=c.id and status='issued' and invoice_type='tax_invoice'),0) invoiced,
 coalesce((select sum(amount::numeric) from public.payment_allocations where contract_id=c.id and reversed_at is null),0) allocated,
 coalesce((select sum(amount::numeric) from public.payments where contract_id=c.id and status='recorded'),0) collected,
 coalesce((select sum(i.total::numeric-private.invoice_paid(i.id)) from public.invoices i where contract_id=c.id and status='issued' and invoice_type='tax_invoice' and due_date<(now() at time zone o.default_timezone)::date),0) overdue,
 coalesce((select sum(amount::numeric) from public.payments where contract_id=c.id and status='recorded' and date_trunc('month',payment_date)=date_trunc('month',now() at time zone o.default_timezone)),0) month_collected,
 coalesce((select sum(i.expected_amount::numeric) from public.payment_schedule_items i join public.payment_schedules s on s.id=i.schedule_id where s.contract_id=c.id and s.status='active'),0) scheduled
 from public.organizations o where o.id=c.organization_id) v
 where c.organization_id=p_organization_id and c.status<>'cancelled' and (p_contract_id is null or c.id=p_contract_id) and (p_customer_id is null or c.customer_id=p_customer_id) group by c.currency)x),'[]');
end$$;
create function public.finance_document(p_organization_id uuid,p_entity text,p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare data jsonb;begin
 if p_entity not in ('invoices','receipts','change_orders','payment_requests') then raise exception 'Invalid document' using errcode='22023';end if;
 data=public.finance_detail(p_organization_id,p_entity,p_id);
 if p_entity='invoices' and data->>'status'='draft' then return private.invoice_document(p_id)||jsonb_build_object('status','draft');end if;
 if data->'document_snapshot'='null'::jsonb then raise exception 'Issue document first' using errcode='22023';end if;
 return data->'document_snapshot'||jsonb_build_object('status',data->>'status');
end$$;
create function public.finance_timeline(p_organization_id uuid,p_contract_id uuid,p_page integer default 1) returns jsonb language plpgsql stable security definer set search_path='' as $$declare result jsonb;begin
 if not private.finance_access(p_organization_id,'contract.view') or p_page not between 1 and 10000 then raise exception 'Forbidden' using errcode='42501';end if;
 select coalesce(jsonb_agg(x),'[]') into result from (
 select a.action,a.created_at,a.entity_type,a.entity_id from public.audit_logs a
 where a.organization_id=p_organization_id and private.finance_access(p_organization_id,coalesce(private.finance_read_permission(a.entity_type),'financial_report.view')) and
 ((a.entity_type='contracts' and a.entity_id=p_contract_id::text) or exists(select 1 from public.invoices where contract_id=p_contract_id and a.entity_type='invoices' and id::text=a.entity_id) or exists(select 1 from public.payments where contract_id=p_contract_id and a.entity_type='payments' and id::text=a.entity_id) or exists(select 1 from public.receipts where contract_id=p_contract_id and a.entity_type='receipts' and id::text=a.entity_id) or exists(select 1 from public.change_orders where contract_id=p_contract_id and a.entity_type='change_orders' and id::text=a.entity_id) or exists(select 1 from public.payment_schedules where contract_id=p_contract_id and a.entity_type='payment_schedules' and id::text=a.entity_id) or exists(select 1 from public.payment_requests where contract_id=p_contract_id and a.entity_type='payment_requests' and id::text=a.entity_id))
 order by a.created_at desc,a.id limit 25 offset (p_page-1)*25)x;return result;
end$$;
revoke all on function private.finance_read_permission(text),private.finance_row(text,jsonb) from public,anon,authenticated;
revoke all on function public.finance_search(uuid,text,jsonb,integer),public.finance_detail(uuid,text,uuid),public.finance_summary(uuid,uuid,uuid),public.finance_document(uuid,text,uuid),public.finance_timeline(uuid,uuid,integer) from public,anon;
grant execute on function public.finance_search(uuid,text,jsonb,integer),public.finance_detail(uuid,text,uuid),public.finance_summary(uuid,uuid,uuid),public.finance_document(uuid,text,uuid),public.finance_timeline(uuid,uuid,integer) to authenticated;
commit;
