begin;
create function public.website_submit_lead(p_hostname text,p_page text,p_form text,p_values jsonb,p_honeypot text default '',p_attribution jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare w public.websites;v public.website_versions;form jsonb;field jsonb;answer jsonb;k text;name text;phone text;email text='';location text='';notes text='';consent boolean=false;source uuid;stage uuid;lead uuid;bucket timestamptz;hits integer;counter bigint;prefix text;yr integer;attrs jsonb='{}';begin
 select * into w from public.websites where id=private.website_resolve(p_hostname);
 if w.id is null or not private.entitled(w.organization_id,'crm') or not coalesce((private.website_config(w.organization_id)->>'forms')::boolean,false) then raise exception 'Form unavailable' using errcode='42501';end if;
 perform 1 from public.organizations where id=w.organization_id for update;
 -- Recheck live authorization after waiting for the serialization lock.
 if private.website_resolve(p_hostname) is distinct from w.id then raise exception 'Form unavailable' using errcode='42501';end if;
 select * into w from public.websites where id=w.id;
 select * into v from public.website_versions where id=w.published_version_id;
 select value into form from jsonb_array_elements(v.snapshot->'document'->'forms') where value->>'id'=p_form and value->>'enabled'='true';
 if form is null or not exists(select 1 from jsonb_array_elements(v.snapshot->'document'->'pages') p where p->>'path'=p_page and jsonb_path_exists(p,'$.nodes.** ? (@.type == "lead_form" && @.props.form == $form)',jsonb_build_object('form',p_form))) then raise exception 'Form unavailable' using errcode='42501';end if;
 if jsonb_typeof(p_values) is distinct from 'object' or octet_length(p_values::text)>16000 or jsonb_typeof(p_attribution) is distinct from 'object' or octet_length(p_attribution::text)>3000 then raise exception 'Invalid enquiry' using errcode='22023';end if;
 bucket=date_trunc('minute',now());
 insert into private.website_form_limits(website_id,bucket,hits) values(w.id,bucket,1) on conflict(website_id,bucket) do update set hits=private.website_form_limits.hits+1 returning private.website_form_limits.hits into hits;
 if hits>60 then return jsonb_build_object('accepted',false,'message','Please try again shortly.');end if;
 delete from private.website_form_limits where website_id=w.id and bucket<now()-interval '1 day';
 if coalesce(p_honeypot,'')<>'' then return jsonb_build_object('accepted',true,'message',form->>'confirmation');end if;
 for k in select jsonb_object_keys(p_values) loop if not exists(select 1 from jsonb_array_elements(form->'fields') f where f->>'key'=k and f->>'type'<>'hidden') then raise exception 'Unknown enquiry field' using errcode='22023';end if;end loop;
 for field in select value from jsonb_array_elements(form->'fields') loop
  answer=case when field->>'type'='hidden' then field->'value' else p_values->(field->>'key') end;
  if (field->>'required')::boolean and (answer is null or answer='null'::jsonb or answer='""'::jsonb or field->>'type' in ('consent','checkbox') and answer<>'true'::jsonb) then raise exception 'Required enquiry field missing' using errcode='22023';end if;
  if answer is null or answer='null'::jsonb then continue;end if;
  if field->>'type' in ('consent','checkbox') then if jsonb_typeof(answer)<>'boolean' then raise exception 'Invalid checkbox' using errcode='22023';end if;
  elsif jsonb_typeof(answer)<>'string' or length(answer#>>'{}')>2000 then raise exception 'Invalid enquiry value' using errcode='22023';end if;
  if field->>'type' in ('select','radio') and not (field->'options') @> jsonb_build_array(answer) then raise exception 'Invalid enquiry option' using errcode='22023';end if;
  if field->>'type'='email' and answer#>>'{}'<>'' and answer#>>'{}' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Invalid email' using errcode='22023';end if;
  if field->>'type'='number' and answer#>>'{}' !~ '^-?[0-9]+(\.[0-9]{1,6})?$' then raise exception 'Invalid number' using errcode='22023';end if;
  if field->>'type'='date' and answer#>>'{}' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid date' using errcode='22023';end if;
  case field->>'mapping'
   when 'name' then name=trim(answer#>>'{}');
   when 'phone' then phone=private.normalize_crm_phone(answer#>>'{}');
   when 'email' then email=lower(trim(answer#>>'{}'));
   when 'location' then location=left(answer#>>'{}',500);
   when 'consent' then consent=answer='true'::jsonb;
   else notes=notes||field->>'label'||': '||(answer#>>'{}')||E'\n';
  end case;
 end loop;
 if not consent or name is null or length(name) not between 1 and 200 or phone is null or phone !~ '^\+?[0-9]{7,15}$' or length(email)>254 then raise exception 'Name, valid phone and consent required' using errcode='22023';end if;
 foreach k in array array['utm_source','utm_medium','utm_campaign','utm_content','utm_term','referrer'] loop if p_attribution ? k then attrs=attrs||jsonb_build_object(k,left(p_attribution->>k,200));end if;end loop;
 select id into source from public.lead_sources where organization_id=w.organization_id and key='website' and active;
 select id into stage from public.crm_pipeline_stages where organization_id=w.organization_id and active and outcome='open' order by sort_order,id limit 1;
 if source is null or stage is null then raise exception 'Enquiries are temporarily unavailable' using errcode='23514';end if;
 select id into lead from public.leads where organization_id=w.organization_id and lifecycle<>'archived' and (phone_normalized=phone or email<>'' and email_normalized=email) order by created_at,id limit 1;
 if lead is null then
  yr=extract(year from current_date);insert into private.lead_number_sequences(organization_id,year,last_number) values(w.organization_id,yr,1) on conflict(organization_id,year) do update set last_number=private.lead_number_sequences.last_number+1 returning last_number,private.lead_number_sequences.prefix into counter,prefix;
  insert into public.leads(organization_id,lead_number,name,phone,email,source_id,source_detail,stage_id,location,notes) values(w.organization_id,prefix||'-'||yr||'-'||lpad(counter::text,6,'0'),name,phone,email,source,w.name||' — '||left(p_page,180),stage,location,left(notes,10000)) returning id into lead;
 end if;
 perform private.crm_event(w.organization_id,lead,'system','Website enquiry received with explicit consent',jsonb_build_object('website',w.id,'page',left(p_page,180),'form',p_form,'consent',true,'attribution',attrs));
 insert into private.website_metrics(website_id,day,kind,hits) values(w.id,current_date,'lead_submission',1) on conflict(website_id,day,kind) do update set hits=private.website_metrics.hits+1;
 return jsonb_build_object('accepted',true,'message',form->>'confirmation');
end$$;

create function public.website_asset_save(p_organization_id uuid,p_website_id uuid,p_proof text,p_signature text,p_data text) returns uuid language plpgsql security definer set search_path='' as $$declare proof jsonb;data bytea;target uuid;used bigint;begin
 perform private.website_require(p_organization_id,'website.media.manage',p_website_id);
 proof=private.website_proof(p_proof,p_signature);
 if proof->>'purpose' is distinct from 'website.asset' or proof->>'organizationId' is distinct from p_organization_id::text or proof->>'websiteId' is distinct from p_website_id::text or length(p_data)>14000000 then raise exception 'Invalid media proof' using errcode='42501';end if;
 data=decode(p_data,'base64');
 if encode(extensions.digest(data,'sha256'),'hex') is distinct from proof->>'digest' then raise exception 'Media content mismatch' using errcode='42501';end if;
 select coalesce(sum(bytes),0) into used from public.website_assets where organization_id=p_organization_id and status='ready';
 if used+octet_length(data)>(private.website_config(p_organization_id)->>'storage_bytes')::bigint then raise exception 'Media storage limit reached' using errcode='23514';end if;
 insert into public.website_assets(organization_id,website_id,name,mime,bytes,width,height,alt,digest) values(p_organization_id,p_website_id,proof->>'name',proof->>'mime',octet_length(data),(proof->>'width')::integer,(proof->>'height')::integer,coalesce(proof->>'alt',''),proof->>'digest') returning id into target;
 insert into private.website_asset_data(asset_id,data) values(target,data);
 perform private.website_event(p_organization_id,p_website_id,'asset.uploaded',jsonb_build_object('assetId',target));return target;
end$$;
create function public.website_asset_read(p_organization_id uuid,p_asset_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare a public.website_assets;begin
 select * into a from public.website_assets where organization_id=p_organization_id and id=p_asset_id;
 if a.id is null or not private.website_access(p_organization_id,'website.media.manage',a.website_id) then raise exception 'Unavailable media' using errcode='42501';end if;
 return jsonb_build_object('mime',a.mime,'name',a.name,'data',(select encode(data,'base64') from private.website_asset_data where asset_id=a.id));
end$$;
create function public.website_asset_public(p_hostname text,p_asset_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare site uuid;v public.website_versions;a public.website_assets;begin
 site=private.website_resolve(p_hostname);if site is null then return null;end if;
 select versions.* into v from public.websites w join public.website_versions versions on versions.id=w.published_version_id where w.id=site;
 if not exists(select 1 from jsonb_array_elements(v.snapshot->'document'->'assets') x where x->>'assetId'=p_asset_id::text) then return null;end if;
 select * into a from public.website_assets where id=p_asset_id and website_id=site and status='ready';if a.id is null then return null;end if;
 return jsonb_build_object('mime',a.mime,'name',a.name,'data',(select encode(data,'base64') from private.website_asset_data where asset_id=a.id));
end$$;
create function public.website_asset_manage(p_organization_id uuid,p_asset_id uuid,p_version integer,p_name text,p_alt text,p_archive boolean default false) returns void language plpgsql security definer set search_path='' as $$declare a public.website_assets;begin
 select * into a from public.website_assets where organization_id=p_organization_id and id=p_asset_id;perform private.website_require(p_organization_id,'website.media.manage',a.website_id);
 if a.id is null or a.version is distinct from p_version then raise exception 'Stale media' using errcode='40001';end if;
 if p_archive and (exists(select 1 from public.websites w where w.id=a.website_id and exists(select 1 from jsonb_array_elements(w.document->'assets') x where x->>'assetId'=a.id::text)) or exists(select 1 from public.website_versions v where v.website_id=a.website_id and exists(select 1 from jsonb_array_elements(v.snapshot->'document'->'assets') x where x->>'assetId'=a.id::text))) then raise exception 'Referenced media must be retained for history' using errcode='23514';end if;
 update public.website_assets set name=p_name,alt=p_alt,status=case when p_archive then 'archived' else status end,version=version+1 where id=a.id;
 perform private.website_event(p_organization_id,a.website_id,'asset.updated',jsonb_build_object('assetId',a.id));
end$$;
revoke all on function public.website_submit_lead(text,text,text,jsonb,text,jsonb),public.website_asset_public(text,uuid) from public,anon,authenticated;
grant execute on function public.website_submit_lead(text,text,text,jsonb,text,jsonb),public.website_asset_public(text,uuid) to anon,authenticated;
do $$declare f record;begin for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname in ('website_asset_save','website_asset_read','website_asset_manage') loop execute format('revoke all on function %s from public,anon',f.signature);execute format('grant execute on function %s to authenticated',f.signature);end loop;end$$;
commit;
