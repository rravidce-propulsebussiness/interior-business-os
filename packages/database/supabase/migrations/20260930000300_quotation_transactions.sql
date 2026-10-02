begin;
create function public.commit_quotation(p_message text,p_signature text) returns uuid language plpgsql security definer set search_path='' as $$
declare e jsonb;org uuid;op text;permission text;q public.quotations;r public.quotation_revisions;s public.organization_quotation_settings;p public.projects;c public.customers;line public.quotation_items;target uuid;new_id uuid;counter bigint;yr integer;doc jsonb;snap jsonb;area jsonb;branch uuid;item uuid;
begin
 e=private.verify_quotation_message(p_message,p_signature,'commit');org=(e->>'organization_id')::uuid;op=e->>'action';
 if op is null or op not in ('create','save_line','remove_line','duplicate_line','arrange_line','edit_revision','issue','clone','cancel') then raise exception 'Invalid action' using errcode='22023';end if;
 perform 1 from public.organizations where id=org for update;
 permission=case op when 'create' then 'quotation.create' when 'clone' then 'quotation.create' when 'issue' then 'quotation.issue' when 'cancel' then 'quotation.delete' else 'quotation.edit' end;
 if not private.commercial_access(org,permission,'quotation') or not private.has_permission(org,'quotation.view') then raise exception 'Forbidden' using errcode='42501';end if;
 delete from private.quotation_receipts where expires_at<now();
 insert into private.quotation_receipts(nonce,actor,expires_at) values((e->>'nonce')::uuid,auth.uid(),to_timestamp((e->>'expires')::bigint));
 if op='create' then
  if not private.commercial_access(org,'project.view','projects') or not private.commercial_access(org,'customer.view','customers') then raise exception 'Forbidden' using errcode='42501';end if;
  select * into p from public.projects where organization_id=org and id=(e->>'project_id')::uuid and status='active';
  select * into c from public.customers where organization_id=org and id=p.customer_id and status='active';
  if p.id is null or c.id is null then raise exception 'Unavailable project/customer' using errcode='22023';end if;
  select * into s from public.organization_quotation_settings where organization_id=org;
  if s.id is null then raise exception 'Configure quotation settings first' using errcode='22023';end if;
  yr=extract(year from current_date);
  insert into private.quotation_number_sequences(organization_id,year,last_number) values(org,yr,1) on conflict(organization_id,year) do update set last_number=private.quotation_number_sequences.last_number+1 returning last_number into counter;
  target=gen_random_uuid();new_id=gen_random_uuid();
  doc=jsonb_build_object('branding',s.branding,'customer',jsonb_build_object('name',c.display_name,'legal_name',c.legal_name,'phone',c.phone,'email',c.email,'tax_identifier',c.tax_identifier,'billing_address',c.billing_address),'project',jsonb_build_object('name',p.name,'code',p.code,'site_address',p.site_address),'display',jsonb_build_object('quantity',s.show_quantity,'unit_rate',s.show_unit_rate,'specifications',s.show_specifications));
  insert into public.quotations(id,organization_id,customer_id,project_id,quotation_number,current_revision_id) values(target,org,c.id,p.id,s.prefix||'-'||yr||'-'||lpad(counter::text,6,'0'),new_id);
  insert into public.quotation_revisions(id,organization_id,quotation_id,project_id,revision_number,currency,valid_until,document_snapshot,terms,customer_notes) values(new_id,org,target,p.id,1,e->>'currency',current_date+s.validity_days,doc,s.default_terms,s.default_customer_notes);
 else
  select * into r from public.quotation_revisions where organization_id=org and id=(e->>'revision_id')::uuid for update;
  if r.id is null then raise exception 'Unavailable revision' using errcode='42501';end if;
  select * into q from public.quotations where organization_id=org and id=r.quotation_id for update;
  if r.version is distinct from (e->>'version')::integer then raise exception 'Stale revision' using errcode='40001';end if;
  if q.status='cancelled' or r.status='cancelled' then raise exception 'Cancelled quotation' using errcode='22023';end if;
  target=q.id;new_id=r.id;
  if op not in ('clone','cancel') and r.status<>'draft' then raise exception 'Draft required' using errcode='22023';end if;
  if op='save_line' then
   snap=e->'snapshot';item=(e->>'catalog_item_id')::uuid;
   if jsonb_typeof(snap) is distinct from 'object' or snap->>'line_type' not in ('catalog','manual') or snap->>'snapshot_version' is distinct from '1' then raise exception 'Invalid snapshot' using errcode='22023';end if;
   if snap->>'line_type'='catalog' then
    select branch_id into branch from public.projects where id=r.project_id;
    perform private.require_quote_catalog(org,item,branch);
    if md5(private.quotation_catalog_data(org,item,branch)::text) is distinct from e->>'fingerprint' then raise exception 'Pricing changed' using errcode='40001';end if;
    if snap->'pricing_input'->>'currency' is distinct from r.currency or snap->'pricing_input'->>'organization_id' is distinct from org::text or snap->'pricing_input'->>'item_id' is distinct from item::text or (snap->'pricing_input'->>'branch_id')::uuid is distinct from branch then raise exception 'Pricing context mismatch' using errcode='22023';end if;
   elsif item is not null then raise exception 'Manual line cannot reference catalog' using errcode='22023';end if;
   if (snap->>'line_type'='manual' or jsonb_typeof(snap->'override')='object') and not private.has_permission(org,'quotation.override_rate') then raise exception 'Override forbidden' using errcode='42501';end if;
   if not private.valid_quote_discount(snap->'discount') then raise exception 'Invalid discount' using errcode='22023';end if;
   if snap->'discount'->>'kind'<>'none' and not private.has_permission(org,'quotation.discount') then raise exception 'Discount forbidden' using errcode='42501';end if;
   if (snap->>'final_amount')::numeric<0 or (snap->>'final_amount')::numeric<(snap->>'minimum_amount')::numeric then raise exception 'Below minimum amount' using errcode='22023';end if;
   area='{"name":"","sort_order":0}';
   if e->>'area_id' is not null then select jsonb_build_object('name',name,'sort_order',sort_order,'parent_id',parent_id) into area from public.project_areas where organization_id=org and project_id=r.project_id and id=(e->>'area_id')::uuid and status='active';if area is null then raise exception 'Invalid area' using errcode='22023';end if;end if;
   if e->>'line_id' is not null then
    select * into line from public.quotation_items where id=(e->>'line_id')::uuid and organization_id=org and revision_id=r.id;
    if line.id is null then raise exception 'Unavailable line' using errcode='42501';end if;
    update public.quotation_items set project_area_id=(e->>'area_id')::uuid,catalog_item_id=item,optional=(e->>'optional')::boolean,sort_order=(e->>'sort_order')::integer,description=e->>'description',area_snapshot=area,snapshot=snap,version=version+1 where id=line.id;
   else
    if (select count(*) from public.quotation_items where revision_id=r.id)>=200 then raise exception 'Revision line limit reached' using errcode='22023';end if;
    insert into public.quotation_items(organization_id,revision_id,project_id,project_area_id,catalog_item_id,optional,sort_order,description,area_snapshot,snapshot) values(org,r.id,r.project_id,(e->>'area_id')::uuid,item,(e->>'optional')::boolean,(e->>'sort_order')::integer,e->>'description',area,snap) returning * into line;
   end if;
   delete from public.quotation_item_costs where item_id=line.id;
   if jsonb_typeof(e->'cost')='object' then insert into public.quotation_item_costs(organization_id,item_id,cost_snapshot) values(org,line.id,e->'cost');end if;
  elsif op='arrange_line' then
   select * into line from public.quotation_items where id=(e->>'line_id')::uuid and organization_id=org and revision_id=r.id;
   if line.id is null then raise exception 'Unavailable line' using errcode='42501';end if;
   area='{"name":"","sort_order":0}';
   if e->>'area_id' is not null then select jsonb_build_object('name',name,'sort_order',sort_order,'parent_id',parent_id) into area from public.project_areas where organization_id=org and project_id=r.project_id and id=(e->>'area_id')::uuid and status='active';if area is null then raise exception 'Invalid area' using errcode='22023';end if;end if;
   update public.quotation_items set project_area_id=(e->>'area_id')::uuid,area_snapshot=area,sort_order=(e->>'sort_order')::integer,optional=(e->>'optional')::boolean,description=e->>'description',version=version+1 where id=line.id;
  elsif op='duplicate_line' then
   if (select count(*) from public.quotation_items where revision_id=r.id)>=200 then raise exception 'Revision line limit reached' using errcode='22023';end if;
   select * into line from public.quotation_items where id=(e->>'line_id')::uuid and organization_id=org and revision_id=r.id;
   if line.id is null then raise exception 'Unavailable line' using errcode='42501';end if;
   item=gen_random_uuid();
   insert into public.quotation_items(id,organization_id,revision_id,project_id,project_area_id,catalog_item_id,optional,sort_order,description,area_snapshot,snapshot) values(item,org,r.id,r.project_id,line.project_area_id,line.catalog_item_id,line.optional,line.sort_order,line.description,line.area_snapshot,line.snapshot);
   insert into public.quotation_item_costs(organization_id,item_id,cost_snapshot) select org,item,cost_snapshot from public.quotation_item_costs where item_id=line.id;
  elsif op='remove_line' then
   select * into line from public.quotation_items where id=(e->>'line_id')::uuid and organization_id=org and revision_id=r.id;
   if line.id is null then raise exception 'Unavailable line' using errcode='42501';end if;
   delete from public.quotation_item_costs where item_id=line.id;
   delete from public.quotation_items where id=line.id;
  elsif op='edit_revision' then
   if e->'discount' is distinct from r.discount and not private.has_permission(org,'quotation.discount') then raise exception 'Discount forbidden' using errcode='42501';end if;
   if length(e->>'terms')>10000 or length(e->>'customer_notes')>10000 or length(e->>'internal_notes')>10000 then raise exception 'Text too long' using errcode='22023';end if;
   update public.quotation_revisions set terms=e->>'terms',customer_notes=e->>'customer_notes',internal_notes=e->>'internal_notes',valid_until=(e->>'valid_until')::date,discount=e->'discount' where id=r.id;
   r.discount=e->'discount';
  elsif op='issue' then
   if not exists(select 1 from public.quotation_items where revision_id=r.id and not optional) then raise exception 'At least one included line required' using errcode='22023';end if;
   update public.quotation_revisions set status='superseded',superseded_at=now(),version=version+1 where quotation_id=q.id and status='issued';
   update public.quotation_revisions set status='issued',issued_at=now(),issued_by=auth.uid(),totals=private.quotation_totals(r.id,r.discount),version=version+1 where id=r.id;
   update public.quotations set status='issued',current_revision_id=r.id,version=version+1 where id=q.id;
  elsif op='clone' then
   if exists(select 1 from public.quotation_revisions where quotation_id=q.id and status='draft') then raise exception 'Draft already exists' using errcode='40001';end if;
   new_id=gen_random_uuid();
   insert into public.quotation_revisions(id,organization_id,quotation_id,project_id,revision_number,currency,valid_until,document_snapshot,terms,customer_notes,internal_notes,discount,totals,created_from_revision_id) values(new_id,org,q.id,r.project_id,q.next_revision,r.currency,r.valid_until,r.document_snapshot,r.terms,r.customer_notes,r.internal_notes,r.discount,r.totals,r.id);
   insert into public.quotation_items(organization_id,revision_id,project_id,project_area_id,catalog_item_id,lineage_id,optional,sort_order,description,area_snapshot,snapshot) select organization_id,new_id,project_id,project_area_id,catalog_item_id,lineage_id,optional,sort_order,description,area_snapshot,snapshot from public.quotation_items where revision_id=r.id;
   insert into public.quotation_item_costs(organization_id,item_id,cost_snapshot) select org,n.id,cost.cost_snapshot from public.quotation_items old_line join public.quotation_item_costs cost on cost.item_id=old_line.id join public.quotation_items n on n.revision_id=new_id and n.lineage_id=old_line.lineage_id where old_line.revision_id=r.id;
   update public.quotations set next_revision=next_revision+1,current_revision_id=new_id,version=version+1 where id=q.id;
  elsif op='cancel' then
   if r.status not in ('draft','issued') then raise exception 'Invalid cancellation' using errcode='22023';end if;
   update public.quotation_revisions set status='cancelled',cancelled_at=now(),version=version+1 where id=r.id;
   if q.current_revision_id=r.id then update public.quotations set status='cancelled',version=version+1 where id=q.id;end if;
  end if;
  if op in ('save_line','remove_line','duplicate_line','arrange_line','edit_revision') then update public.quotation_revisions set totals=private.quotation_totals(r.id,r.discount),version=version+1 where id=r.id;end if;
 end if;
 insert into public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id,metadata) values(auth.uid(),org,'quotation.'||op,'quotation_revisions',new_id::text,jsonb_build_object('quotation_id',target,'revision_id',new_id,'line_id',line.id));
 return new_id;
end $$;
revoke all on function public.commit_quotation(text,text) from public,anon;
grant execute on function public.commit_quotation(text,text) to authenticated;
commit;
