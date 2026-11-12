\set ON_ERROR_STOP on
begin;

create function private.meta_lead_assert(ok boolean, label text)
returns void language plpgsql as $$
begin
 if ok is distinct from true then raise exception 'FAILED: %', label; end if;
 raise notice 'PASS: %', label;
end $$;
create function private.meta_lead_denied(query text, label text)
returns void language plpgsql as $$
begin
 begin
   execute query;
 exception when sqlstate '42501' then
   raise notice 'PASS: %', label;
   return;
 end;
 raise exception 'FAILED: %', label;
end $$;

\set org 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
\set owner '11111111-1111-4111-8111-111111111111'
\set page 'aaaaaaaa-0000-4000-8000-00000000a001'
\set form 'aaaaaaaa-0000-4000-8000-00000000a002'
\set wa 'aaaaaaaa-0000-4000-8000-00000000a003'

insert into public.meta_lead_pages(id,organization_id,page_id,page_name,token_ciphertext,token_iv,token_tag,connected_by)
 values(:'page',:'org','100000000000001','Demo Page','cipher','iv','tag',:'owner');
insert into public.meta_lead_forms(id,organization_id,page_row_id,page_id,form_id,form_name,created_by,
   whatsapp_connection_id,confirm_enabled,template_name,template_language,quote_enabled,quote_message)
 values(:'form',:'org',:'page','100000000000001','200000000000001','Villa interiors form',:'owner',
   :'wa',true,'lead_details_confirmation','en',true,'Hi {{name}}, our packages: {{packages}}');
insert into private.construction_quote_packages(organization_id,name,code,rate_per_sqft,created_by)
 values(:'org','Meta Test Standard','METASTD',1650,:'owner'),
       (:'org','Meta Test Premium','METAPRM',2100,:'owner');

-- Browser roles can neither read tokens nor forge leads.
set local role authenticated;
select set_config('request.jwt.claim.sub',:'owner',true);
select private.meta_lead_denied('select token_ciphertext from public.meta_lead_pages','signed-in members cannot read Page tokens');
select private.meta_lead_denied('select 1 from public.meta_lead_forms','signed-in members cannot read form rows directly');
select private.meta_lead_denied(
 format('select public.meta_lead_ingest(%L,%L,%L,%L::jsonb)',:'org',:'form','300000000000001','{"name":"Forged","phone":"+919000000001"}'),
 'signed-in members cannot call the ingest function');
select private.meta_lead_denied(
 format('select public.meta_lead_reply(%L,%L,%L,%L)',:'org',:'wa','919000000001','YES'),
 'signed-in members cannot call the reply function');
reset role;
select private.meta_lead_assert(
 not has_function_privilege('anon','public.meta_lead_ingest(uuid,uuid,text,jsonb)','EXECUTE')
 and not has_function_privilege('anon','public.meta_lead_reply(uuid,uuid,text,text)','EXECUTE')
 and not has_table_privilege('anon','public.meta_lead_pages','SELECT'),
 'anonymous callers have no access to Meta lead functions or tokens');

set local role service_role;
select public.meta_lead_ingest(:'org',:'form','300000000000001',
 '{"name":"Asha Rao","phone":"+91 90000 00001","email":"Asha@Example.test","location":"Hyderabad","service_type":"Full home interiors","project_size":"1800","notes":"Budget: 15L","wa_id":"919000000001","platform":"ig"}'
) as first \gset
reset role;
select private.meta_lead_assert(
 (:'first'::jsonb->>'status')='imported'
 and (:'first'::jsonb->>'wa_id')='919000000001'
 and exists(select 1 from public.leads l join public.lead_sources s on s.id=l.source_id
   where l.id=(:'first'::jsonb->>'lead_id')::uuid and l.organization_id=:'org'
     and s.key='meta_lead_ads' and l.name='Asha Rao' and l.email='asha@example.test'
     and l.location='Hyderabad' and l.project_size='1800'
     and l.source_detail like 'meta:300000000000001 / %'),
 'a Meta lead becomes a CRM lead with the Meta Lead Ads source');
select private.meta_lead_assert(
 exists(select 1 from public.lead_activities where lead_id=(:'first'::jsonb->>'lead_id')::uuid
   and body like 'Lead received from Meta lead form:%'),
 'the lead timeline records where the lead came from');

set local role service_role;
select public.meta_lead_ingest(:'org',:'form','300000000000001','{"name":"Asha Rao","phone":"+919000000001"}') as retry \gset
select public.meta_lead_ingest(:'org',:'form','300000000000002','{"name":"Asha R","phone":"09000000001","email":"asha@example.test"}') as again \gset
select public.meta_lead_ingest(:'org',:'form','300000000000003','{"name":"No Phone","phone":"abc"}') as bad \gset
reset role;
select private.meta_lead_assert((:'retry'::jsonb->>'status')='already_processed',
 'a webhook retry for the same Meta lead is ignored');
select private.meta_lead_assert(
 (:'again'::jsonb->>'status')='duplicate' and (:'again'::jsonb->>'lead_id')=(:'first'::jsonb->>'lead_id')
 and (select count(*)=1 from public.leads where organization_id=:'org' and email_normalized='asha@example.test'),
 'a second form from the same person does not create a second lead');
select private.meta_lead_assert(
 (:'bad'::jsonb->>'status')='failed'
 and (select status='failed' and error is not null from public.meta_lead_events where leadgen_id='300000000000003'),
 'a lead without a valid phone is recorded as failed, not created');
select private.meta_lead_assert(
 (select leads_received=3 and leads_created=1 and leads_duplicate=1 and leads_failed=1 and last_error is not null
    from public.meta_lead_forms where id=:'form'),
 'form counters reflect each outcome once');

-- A failed lead may be retried (for example after the form is corrected).
set local role service_role;
select public.meta_lead_ingest(:'org',:'form','300000000000003','{"name":"Now Valid","phone":"+919000000003","wa_id":"919000000003"}') as fixed \gset
select public.meta_lead_reply(:'org',:'wa','919000000001','YES') is null as before_send \gset
select public.meta_lead_confirmation_logged(:'org','300000000000001',:'wa',true,null);
select public.meta_lead_confirmation_logged(:'org','300000000000003',:'wa',false,'Template is not approved');
reset role;
select private.meta_lead_assert((:'fixed'::jsonb->>'status')='imported','a previously failed Meta lead can be imported later');
select private.meta_lead_assert(:'before_send','a reply before any confirmation was sent is left to normal automations');
select private.meta_lead_assert(
 (select whatsapp_status='awaiting_confirmation' from public.meta_lead_events where leadgen_id='300000000000001')
 and (select whatsapp_status='failed' and whatsapp_error='Template is not approved' from public.meta_lead_events where leadgen_id='300000000000003'),
 'confirmation delivery outcome is stored per lead');

set local role service_role;
select public.meta_lead_reply(:'org','aaaaaaaa-0000-4000-8000-00000000a009','919000000001','YES') is null as other_number \gset
select public.meta_lead_reply(:'org',:'wa','919000000003','YES') is null as failed_send \gset
select public.meta_lead_reply(:'org',:'wa','919000000001',' yes. ') as confirmed \gset
select public.meta_lead_reply(:'org',:'wa','919000000001','YES') is null as second_yes \gset
reset role;
select private.meta_lead_assert(:'other_number','a reply on another WhatsApp number does not confirm');
select private.meta_lead_assert(:'failed_send','a lead whose confirmation failed is not treated as awaiting');
select private.meta_lead_assert(
 (:'confirmed'::jsonb->>'action')='send_quote'
 and (:'confirmed'::jsonb->>'lead_name')='Asha Rao'
 and (:'confirmed'::jsonb->>'project_size')='1800'
 and (:'confirmed'::jsonb->'packages') @> '[{"name":"Meta Test Standard","rate_per_sqft":1650}]'
 and (select whatsapp_status='confirmed' and confirmed_at is not null from public.meta_lead_events where leadgen_id='300000000000001'),
 'YES confirms the details and returns the quotation to send');
select private.meta_lead_assert(:'second_yes','a confirmation is consumed once');

set local role service_role;
select public.meta_lead_quote_logged(:'org','300000000000001',true,'Hi Asha Rao, our packages: ...',null);
reset role;
select private.meta_lead_assert(
 (select whatsapp_status='quote_sent' from public.meta_lead_events where leadgen_id='300000000000001')
 and exists(select 1 from public.lead_activities where lead_id=(:'first'::jsonb->>'lead_id')::uuid
   and body like 'Indicative quotation shared automatically on WhatsApp:%'),
 'the shared quotation is recorded on the lead timeline');

-- Anything other than a confirmation is noted for the team and not answered with a quote.
set local role service_role;
select public.meta_lead_ingest(:'org',:'form','300000000000004','{"name":"Kiran","phone":"+919000000004","wa_id":"919000000004"}') as kiran \gset
select public.meta_lead_confirmation_logged(:'org','300000000000004',:'wa',true,null);
select public.meta_lead_reply(:'org',:'wa','919000000004','My flat is 1200 sqft not 1800') as corrected \gset
reset role;
select private.meta_lead_assert(
 (:'corrected'::jsonb->>'action')='replied'
 and (select whatsapp_status='replied' from public.meta_lead_events where leadgen_id='300000000000004')
 and exists(select 1 from public.lead_activities where lead_id=(:'kiran'::jsonb->>'lead_id')::uuid
   and body like '%My flat is 1200 sqft not 1800%'),
 'a correction is logged on the lead for a person to follow up');

-- One lead form can feed only one company at a time.
do $$ begin
  begin
    insert into public.meta_lead_forms(organization_id,page_row_id,page_id,form_id,form_name,created_by)
     values('dddddddd-dddd-4ddd-8ddd-dddddddddddd','aaaaaaaa-0000-4000-8000-00000000a001','100000000000001','200000000000001','Copy','11111111-1111-4111-8111-111111111111');
  exception when unique_violation then
    raise notice 'PASS: an active lead form cannot be connected twice';
    return;
  end;
  raise exception 'FAILED: an active lead form cannot be connected twice';
end $$;

rollback;
