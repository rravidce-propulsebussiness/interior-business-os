begin;
create or replace function public.website_submit_lead(p_hostname text,p_page text,p_form text,p_values jsonb,p_honeypot text default '',p_attribution jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
<<website_submission>>
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
 insert into private.website_form_limits(website_id,bucket,hits) values(w.id,bucket,1) on conflict on constraint website_form_limits_pkey do update set hits=private.website_form_limits.hits+1 returning private.website_form_limits.hits into hits;
 if hits>60 then return jsonb_build_object('accepted',false,'message','Please try again shortly.');end if;
 delete from private.website_form_limits limits where limits.website_id=w.id and limits.bucket<now()-interval '1 day';
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
   else notes=notes||(field->>'label')||': '||(answer#>>'{}')||E'\n';
  end case;
 end loop;
 if not consent or name is null or length(name) not between 1 and 200 or phone is null or phone !~ '^\+?[0-9]{7,15}$' or length(email)>254 then raise exception 'Name, valid phone and consent required' using errcode='22023';end if;
 foreach k in array array['utm_source','utm_medium','utm_campaign','utm_content','utm_term','referrer'] loop if p_attribution ? k then attrs=attrs||jsonb_build_object(k,left(p_attribution->>k,200));end if;end loop;
 select id into source from public.lead_sources where organization_id=w.organization_id and key='website' and active;
 select id into stage from public.crm_pipeline_stages where organization_id=w.organization_id and active and outcome='open' order by sort_order,id limit 1;
 if source is null or stage is null then raise exception 'Enquiries are temporarily unavailable' using errcode='23514';end if;
 select id into lead from public.leads where organization_id=w.organization_id and lifecycle<>'archived' and (phone_normalized=website_submission.phone or website_submission.email<>'' and email_normalized=website_submission.email) order by created_at,id limit 1;
 if lead is null then
  yr=extract(year from current_date);insert into private.lead_number_sequences(organization_id,year,last_number) values(w.organization_id,yr,1) on conflict(organization_id,year) do update set last_number=private.lead_number_sequences.last_number+1 returning last_number,private.lead_number_sequences.prefix into counter,prefix;
  insert into public.leads(organization_id,lead_number,name,phone,email,source_id,source_detail,stage_id,location,notes) values(w.organization_id,prefix||'-'||yr||'-'||lpad(counter::text,6,'0'),name,phone,email,source,w.name||' — '||left(p_page,180),stage,location,left(notes,10000)) returning id into lead;
 end if;
 perform private.crm_event(w.organization_id,lead,'system','Website enquiry received with explicit consent',jsonb_build_object('website',w.id,'page',left(p_page,180),'form',p_form,'consent',true,'attribution',attrs));
 insert into private.website_metrics(website_id,day,kind,hits) values(w.id,current_date,'lead_submission',1) on conflict(website_id,day,kind) do update set hits=private.website_metrics.hits+1;
 return jsonb_build_object('accepted',true,'message',form->>'confirmation');
end$$;



commit;
