begin;
create function private.customer_quote_projection(revision uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('number',q.quotation_number,'revision',r.revision_number,'status',r.status,'currency',r.currency,'valid_until',r.valid_until,'terms',r.terms,'notes',r.customer_notes,
 'header',jsonb_build_object('branding',jsonb_build_object('name',r.document_snapshot->'branding'->'name','phone',r.document_snapshot->'branding'->'phone','email',r.document_snapshot->'branding'->'email','tax_identifier',r.document_snapshot->'branding'->'tax_identifier','accent',r.document_snapshot->'branding'->'accent','logo_data_uri',r.document_snapshot->'branding'->'logo_data_uri','address',jsonb_build_object('line1',r.document_snapshot#>'{branding,address,line1}','line2',r.document_snapshot#>'{branding,address,line2}','city',r.document_snapshot#>'{branding,address,city}','region',r.document_snapshot#>'{branding,address,region}','postal_code',r.document_snapshot#>'{branding,address,postal_code}','country_code',r.document_snapshot#>'{branding,address,country_code}')),
 'customer',jsonb_build_object('name',r.document_snapshot#>'{customer,name}','legal_name',r.document_snapshot#>'{customer,legal_name}','phone',r.document_snapshot#>'{customer,phone}','email',r.document_snapshot#>'{customer,email}','tax_identifier',r.document_snapshot#>'{customer,tax_identifier}','billing_address',jsonb_build_object('line1',r.document_snapshot#>'{customer,billing_address,line1}','line2',r.document_snapshot#>'{customer,billing_address,line2}','city',r.document_snapshot#>'{customer,billing_address,city}','region',r.document_snapshot#>'{customer,billing_address,region}','postal_code',r.document_snapshot#>'{customer,billing_address,postal_code}','country_code',r.document_snapshot#>'{customer,billing_address,country_code}')),
 'project',jsonb_build_object('name',r.document_snapshot#>'{project,name}','code',r.document_snapshot#>'{project,code}','site_address',jsonb_build_object('line1',r.document_snapshot#>'{project,site_address,line1}','line2',r.document_snapshot#>'{project,site_address,line2}','city',r.document_snapshot#>'{project,site_address,city}','region',r.document_snapshot#>'{project,site_address,region}','postal_code',r.document_snapshot#>'{project,site_address,postal_code}','country_code',r.document_snapshot#>'{project,site_address,country_code}')),
 'display',jsonb_build_object('quantity',r.document_snapshot#>'{display,quantity}','unit_rate',r.document_snapshot#>'{display,unit_rate}','specifications',r.document_snapshot#>'{display,specifications}')),
 'totals',jsonb_build_object('line_subtotal',r.totals->'line_subtotal','line_discount',r.totals->'line_discount','subtotal',r.totals->'subtotal','revision_discount',r.totals->'revision_discount','final_amount',r.totals->'final_amount','optional_amount',r.totals->'optional_amount'),
 'lines',coalesce((select jsonb_agg(jsonb_build_object('name',i.snapshot->'name','description',i.description,'area',i.area_snapshot->'name','optional',i.optional,'quantity',i.snapshot->'quantity','unit',i.snapshot#>'{unit,label}','rate',i.snapshot->'display_rate','amount',i.snapshot->'final_amount','discount',i.snapshot->'discount_amount','specifications',coalesce((select jsonb_agg(jsonb_build_object('label',v->'label','value',v->'value')) from jsonb_array_elements(i.snapshot->'customer_specifications') v),'[]')) order by (i.area_snapshot->>'sort_order')::integer,i.sort_order,i.id) from public.quotation_items i where i.revision_id=r.id),'[]'))
 from public.quotation_revisions r join public.quotations q on q.id=r.quotation_id where r.id=revision;
$$;
create function public.quotation_share_manage(p_organization_id uuid,p_action text,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.quotation_revisions;s public.quotation_share_links;target uuid;token text;lead uuid;begin
 perform 1 from public.organizations where id=p_organization_id for update;
 if not private.commercial_access(p_organization_id,'quotation.share','quotation') or not private.has_permission(p_organization_id,'quotation.view') then raise exception 'Forbidden' using errcode='42501';end if;
 if p_action is null or p_action not in ('create','revoke','rotate') or jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>2000 then raise exception 'Invalid command' using errcode='22023';end if;
 if p_action in ('revoke','rotate') then
  select * into s from public.quotation_share_links where organization_id=p_organization_id and id=(p_input->>'id')::uuid;
  if s.id is null then raise exception 'Unavailable link' using errcode='42501';end if;
  if s.revoked_at is null then update public.quotation_share_links set revoked_at=now(),revoked_by=auth.uid(),version=version+1 where id=s.id;perform private.crm_audit(p_organization_id,'quotation.share_revoked','quotation_share_links',s.id);end if;
  if p_action='revoke' then return jsonb_build_object('id',s.id);end if;
 end if;
 select * into r from public.quotation_revisions where organization_id=p_organization_id and id=coalesce(s.revision_id,(p_input->>'revision_id')::uuid);
 if r.id is null or r.status<>'issued' or exists(select 1 from public.quotations where id=r.quotation_id and status='cancelled') then raise exception 'Issued revision required' using errcode='22023';end if;
 if p_input->>'expires_at' is not null and (p_input->>'expires_at')::timestamptz<=clock_timestamp() then raise exception 'Future link expiry required' using errcode='22023';end if;
 token=encode(extensions.gen_random_bytes(32),'hex');
 insert into public.quotation_share_links(organization_id,revision_id,expires_at,pdf_enabled) values(p_organization_id,r.id,(p_input->>'expires_at')::timestamptz,coalesce((p_input->>'pdf_enabled')::boolean,true)) returning id into target;
 insert into private.quotation_share_secrets(share_id,token_hash) values(target,encode(extensions.digest(token,'sha256'),'hex'));
 perform private.crm_audit(p_organization_id,'quotation.share_created','quotation_share_links',target);
 select id into lead from public.leads where organization_id=p_organization_id and converted_project_id=r.project_id;
 if lead is not null then perform private.crm_event(p_organization_id,lead,'quotation_shared','Quotation share link created',jsonb_build_object('revision_id',r.id));end if;
 return jsonb_build_object('id',target,'token',token);
end$$;

create function public.public_quotation(p_token text,p_operation text default 'view',p_input jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.quotation_share_links;r public.quotation_revisions;response public.quotation_customer_responses;org uuid;lead uuid;zone text;expired boolean;hits integer;doc jsonb;action text;name text;comment text;begin
 if p_token is null or p_token !~ '^[0-9a-f]{64}$' or p_operation is null or p_operation not in ('view','pdf','respond') or jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>16000 then raise exception 'Unavailable link' using errcode='42501';end if;
 select l.organization_id into org from public.quotation_share_links l join private.quotation_share_secrets k on k.share_id=l.id where k.token_hash=encode(extensions.digest(p_token,'sha256'),'hex');
 if org is null then raise exception 'Unavailable link' using errcode='42501';end if;
 -- Same lock order as issuance, conversion and revocation. Re-read after acquiring it.
 perform 1 from public.organizations where id=org for update;
 select l.* into s from public.quotation_share_links l join private.quotation_share_secrets k on k.share_id=l.id where k.token_hash=encode(extensions.digest(p_token,'sha256'),'hex');
 select * into r from public.quotation_revisions where id=s.revision_id;
 if s.revoked_at is not null or (s.expires_at is not null and s.expires_at<=clock_timestamp()) or not private.entitled(org,'quotation') or r.status not in ('issued','superseded') or exists(select 1 from public.quotations where id=r.quotation_id and status='cancelled') then raise exception 'Unavailable link' using errcode='42501';end if;
 delete from private.quotation_public_limits where share_id=s.id and bucket<clock_timestamp()-interval '2 minutes';
 insert into private.quotation_public_limits(share_id,bucket,operation,hits) values(s.id,date_trunc('minute',clock_timestamp()),p_operation,1) on conflict(share_id,bucket,operation) do update set hits=private.quotation_public_limits.hits+1 returning quotation_public_limits.hits into hits;
 if hits>(case p_operation when 'pdf' then 5 when 'respond' then 10 else 60 end) then raise exception 'Request limit reached' using errcode='54000';end if;
 select default_timezone into zone from public.organizations where id=org;
 expired=r.valid_until<(clock_timestamp() at time zone zone)::date;
 select id into lead from public.leads where organization_id=org and converted_project_id=r.project_id;
 select * into response from public.quotation_customer_responses where revision_id=r.id;
 doc=private.customer_quote_projection(r.id);
 if p_operation='respond' then
  if expired or r.status<>'issued' then raise exception 'Revision cannot receive a response' using errcode='22023';end if;
  if exists(select 1 from jsonb_object_keys(p_input) k where k not in ('action','name','comment','acknowledged')) then raise exception 'Invalid response' using errcode='22023';end if;
  action=p_input->>'action';name=trim(p_input->>'name');comment=trim(coalesce(p_input->>'comment',''));
  if action is null or action not in ('approved','changes_requested','declined') or name is null or length(name) not between 1 and 200 or length(comment)>3000 or (p_input->>'acknowledged')::boolean is distinct from true or (action='changes_requested' and comment='') then raise exception 'Invalid response' using errcode='22023';end if;
  if response.id is not null then
   if response.action=action and response.customer_name=name and response.comment=comment then return jsonb_build_object('action',response.action,'responded_at',response.responded_at);end if;
   raise exception 'A response is already recorded' using errcode='40001';
  end if;
  insert into public.quotation_customer_responses(organization_id,quotation_id,revision_id,share_id,action,customer_name,comment,acknowledged,accepted_amount,currency,snapshot_hash,created_by) values(org,r.quotation_id,r.id,s.id,action,name,comment,true,case when action='approved' then r.totals->>'final_amount' end,r.currency,encode(extensions.digest(doc::text,'sha256'),'hex'),null) returning * into response;
  -- Anonymous acknowledgement is deliberately not attributed to a business Auth user.
  insert into public.audit_logs(organization_id,action,entity_type,entity_id) values(org,'quotation.customer_'||case action when 'changes_requested' then 'change_requested' else action end,'quotation_customer_responses',response.id::text);
  if lead is not null then insert into public.lead_activities(organization_id,lead_id,activity_type,body,system_generated,metadata,created_by) values(org,lead,'customer_response','Customer '||replace(action,'_',' '),true,jsonb_build_object('revision_id',r.id,'response_id',response.id),null);end if;
  return jsonb_build_object('action',response.action,'responded_at',response.responded_at);
 end if;
 if p_operation='pdf' and not s.pdf_enabled then raise exception 'PDF unavailable' using errcode='42501';end if;
 if p_operation='view' then
  update public.quotation_share_links set first_viewed_at=coalesce(first_viewed_at,now()),last_viewed_at=now(),view_count=view_count+1 where id=s.id;
  if s.first_viewed_at is null then
   insert into public.audit_logs(organization_id,action,entity_type,entity_id) values(org,'quotation.customer_viewed','quotation_share_links',s.id::text);
   if lead is not null then insert into public.lead_activities(organization_id,lead_id,activity_type,body,system_generated,metadata,created_by) values(org,lead,'customer_viewed','Customer viewed quotation',true,jsonb_build_object('revision_id',r.id),null);end if;
  end if;
 end if;
 return jsonb_build_object('document',doc,'issued_at',r.issued_at,'expired',expired,'pdf_enabled',s.pdf_enabled,'can_respond',not expired and r.status='issued' and response.id is null,'response',case when response.id is null then null else jsonb_build_object('action',response.action,'name',response.customer_name,'comment',response.comment,'responded_at',response.responded_at) end);
end$$;
revoke all on function private.customer_quote_projection(uuid) from public,anon,authenticated;
revoke all on function public.quotation_share_manage(uuid,text,jsonb) from public,anon;
grant execute on function public.quotation_share_manage(uuid,text,jsonb) to authenticated;
revoke all on function public.public_quotation(text,text,jsonb) from public;
grant execute on function public.public_quotation(text,text,jsonb) to anon,authenticated;
commit;
