-- Standalone website enquiry capture for Growth/Basic without full CRM.
-- Existing CRM-enabled sites retain their canonical CRM lead workflow.
begin;

create table public.website_enquiries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  website_id uuid not null references public.websites(id),
  page_path text not null check (length(page_path)<=180),
  form_id text not null check (length(form_id)<=120),
  name text not null check (length(name) between 1 and 200),
  phone text not null check (length(phone) between 7 and 16),
  email text not null default '' check (length(email)<=254),
  location text not null default '' check (length(location)<=500),
  notes text not null default '' check (length(notes)<=10000),
  attribution jsonb not null default '{}'::jsonb
    check(jsonb_typeof(attribution)='object' and octet_length(attribution::text)<=3000),
  received_at timestamptz not null default now(),
  foreign key(organization_id,website_id)
    references public.websites(organization_id,id)
);
create index website_enquiries_site_time on public.website_enquiries(organization_id,website_id,received_at desc);
alter table public.website_enquiries enable row level security;
alter table public.website_enquiries force row level security;
revoke all on public.website_enquiries from public,anon,authenticated;
grant select on public.website_enquiries to authenticated;
create policy website_enquiries_owner_read on public.website_enquiries
  for select to authenticated
  using(private.website_access(organization_id,'website.view',website_id));

create function public.website_enquiries_read(
 p_organization_id uuid,p_website_id uuid,p_limit integer default 50
) returns jsonb language plpgsql stable security definer set search_path = ''
as $list$
begin
  if p_limit not between 1 and 100 then
    raise exception 'Invalid page size' using errcode='22023';
  end if;
  if not private.website_access(p_organization_id,'website.view',p_website_id) then
    raise exception 'Unavailable website enquiries' using errcode='42501';
  end if;
  return (select coalesce(jsonb_agg(to_jsonb(items)),'[]'::jsonb)
    from (select id,received_at,name,phone,email,location,notes,page_path
      from public.website_enquiries
      where organization_id=p_organization_id and website_id=p_website_id
      order by received_at desc,id desc limit p_limit) items);
end
$list$;

-- Keep the existing extensive field/consent/anti-spam validation from the
-- production CRM form function. Only persistence branches by CRM entitlement.
create or replace function public.website_submit_enquiry(p_hostname text,p_page text,p_form text,p_values jsonb,p_honeypot text default '',p_attribution jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare w public.websites;v public.website_versions;form jsonb;field jsonb;answer jsonb;k text;name text;phone text;email text='';location text='';notes text='';consent boolean=false;source uuid;stage uuid;lead uuid;bucket timestamptz;hits integer;counter bigint;prefix text;yr integer;attrs jsonb='{}';begin
 select * into w from public.websites where id=private.website_resolve(p_hostname);
 if w.id is null or not coalesce((private.website_config(w.organization_id)->>'forms')::boolean,false) then raise exception 'Form unavailable' using errcode='42501';end if;
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

 -- Website-only tiers store validated enquiries separately without unlocking CRM.
 if not private.entitled(w.organization_id,'crm') then
   insert into public.website_enquiries (
     organization_id,website_id,page_path,form_id,name,phone,email,
     location,notes,attribution
   ) values (
     w.organization_id,w.id,left(p_page,180),left(p_form,120),
     name,phone,email,location,left(notes,10000),attrs
   );
   insert into private.website_metrics(website_id,day,kind,hits)
   values(w.id,current_date,'lead_submission',1)
   on conflict(website_id,day,kind)
   do update set hits=private.website_metrics.hits+1;
   return jsonb_build_object('accepted',true,'message',form->>'confirmation');
 end if;
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

-- Public rendering no longer disables forms solely because CRM is excluded.
create or replace function public.website_public(p_hostname text) returns jsonb language plpgsql stable security definer set search_path='' as $$declare w public.websites;v public.website_versions;config jsonb;begin
 if p_hostname is null or length(p_hostname)>253 or p_hostname<>lower(p_hostname) or p_hostname ~ '[/@:\s\\]' then return null;end if;
 select * into w from public.websites where id=private.website_resolve(p_hostname);if w.id is null then return null;end if;
 select * into v from public.website_versions where id=w.published_version_id and website_id=w.id;
 -- Preserve the latest public renderer's platform component denylist guard.
 if not private.website_build_allowed(v.snapshot) then return null;end if;
 config=private.website_config(w.organization_id);
 if (coalesce(v.snapshot->'document'->>'css','')<>'' or jsonb_array_length(v.snapshot->'artifacts')>0) and not coalesce((config->>'custom_code')::boolean,false) or jsonb_array_length(v.snapshot->'artifacts')>0 and not coalesce((config->>'developer_mode')::boolean,false) then return null;end if;
 return jsonb_build_object('version',v.id,'publishedAt',v.created_at,'hostname',p_hostname,'build',v.snapshot,'formsEnabled',coalesce((config->>'forms')::boolean,false));
end$$;

-- Form-capable website plans can publish website-only forms.
create or replace function public.website_publish(p_organization_id uuid,p_website_id uuid,p_version integer,p_build_text text,p_signature text,p_summary text,p_restore_id uuid default null) returns uuid language plpgsql security definer set search_path='' as $$declare w public.websites;proof jsonb;build jsonb;target uuid;seq integer;config jsonb;a jsonb;domain_count integer;begin
 perform private.website_require(p_organization_id,'website.page.publish',p_website_id);
 select * into w from public.websites where organization_id=p_organization_id and id=p_website_id for update;
 if w.id is null or w.status in ('suspended','archived') then raise exception 'Unavailable website' using errcode='42501';end if;
 if w.version is distinct from p_version then raise exception 'Stale publish' using errcode='40001';end if;
 proof=private.website_proof(p_build_text,p_signature);
 if proof->>'purpose' is distinct from 'website.publish' or proof->>'organizationId' is distinct from p_organization_id::text or proof->>'websiteId' is distinct from w.id::text or (proof->>'version')::integer is distinct from w.version or proof->>'restoreId' is distinct from p_restore_id::text then raise exception 'Build ownership mismatch' using errcode='42501';end if;
 if p_restore_id is not null then perform private.website_require(p_organization_id,'website.page.restore',w.id);if not exists(select 1 from public.website_versions where id=p_restore_id and website_id=w.id and organization_id=p_organization_id) then raise exception 'Unavailable restore version' using errcode='42501';end if;end if;
 build=proof->'build';config=private.website_config(p_organization_id);
 if build->>'schemaVersion' is distinct from '1' or jsonb_typeof(build->'document'->'pages') is distinct from 'array' or jsonb_array_length(build->'document'->'pages') not between 1 and least(200,(config->>'pages')::integer) then raise exception 'Invalid build' using errcode='22023';end if;
 if coalesce(build->'document'->>'css','')<>'' or jsonb_array_length(build->'artifacts')>0 then
  perform private.website_require(p_organization_id,'website.custom_code.publish',w.id);
  if not coalesce((config->>'custom_code')::boolean,false) or jsonb_array_length(build->'artifacts')>0 and not coalesce((config->>'developer_mode')::boolean,false) then raise exception 'Custom code capability required' using errcode='42501';end if;
 end if;
 if jsonb_path_exists(build,'$.document.forms[*] ? (@.enabled == true)') and not coalesce((config->>'forms')::boolean,false) then raise exception 'Website forms require Forms capability' using errcode='42501';end if;
 -- A template-only plan may edit its copied template but cannot publish an
 -- arbitrary blank draft created through a direct RPC call.
 if coalesce((config->>'template_only')::boolean,false)
   and not exists (
     select 1 from public.website_events e
     where e.organization_id=p_organization_id and e.website_id=w.id
       and e.action='website.template_applied'
   ) then
   raise exception 'A published template is required for this plan'
      using errcode='42501';
 end if;
 for a in select value from jsonb_array_elements(build->'document'->'assets') loop
  if not exists(select 1 from public.website_assets where organization_id=p_organization_id and website_id=w.id and id=(a->>'assetId')::uuid and status='ready') then raise exception 'Unavailable asset' using errcode='42501';end if;
 end loop;
 select coalesce(max(sequence),0)+1 into seq from public.website_versions where website_id=w.id;
 insert into public.website_versions(organization_id,website_id,sequence,summary,snapshot,restored_from) values(p_organization_id,w.id,seq,p_summary,build,p_restore_id) returning id into target;
 update public.websites set published_version_id=target,status='published',version=version+1 where id=w.id;
 perform private.website_event(p_organization_id,w.id,case when p_restore_id is null then 'website.published' else 'website.version_restored' end,jsonb_build_object('sequence',seq,'versionId',target));return target;
end$$;

revoke all on function public.website_submit_enquiry(text,text,text,jsonb,text,jsonb)
  from public,authenticated;
grant execute on function public.website_submit_enquiry(text,text,text,jsonb,text,jsonb)
  to anon,authenticated;
revoke all on function public.website_enquiries_read(uuid,uuid,integer)
  from public,anon;
grant execute on function public.website_enquiries_read(uuid,uuid,integer)
  to authenticated;

commit;
