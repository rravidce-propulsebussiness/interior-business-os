begin;
create function pg_temp.template_assert(ok boolean,label text) returns void language plpgsql as $$begin
 if ok is distinct from true then raise exception 'FAIL: %',label;end if;raise notice 'PASS: %',label;
end$$;
create function pg_temp.template_denied(command text,label text) returns void language plpgsql as $$begin
 begin execute command;exception when insufficient_privilege or check_violation or invalid_parameter_value or serialization_failure then raise notice 'PASS: %',label;return;end;
 raise exception 'FAIL: %',label;
end$$;
create function pg_temp.template_signature(body jsonb) returns text language sql security definer set search_path='' as $$
 select encode(extensions.hmac(convert_to(body::text,'UTF8'),convert_to('template-test-signing-key-local-only-123456','UTF8'),'sha256'),'hex');
$$;
insert into private.website_build_keys(key_id,secret) values('template-test',convert_to('template-test-signing-key-local-only-123456','UTF8'));
insert into public.organization_entitlements(organization_id,module_id,enabled,source,configuration)
 select 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',id,true,'manual','{"sites":20,"pages":100,"custom_code":false,"developer_mode":false,"forms":true,"custom_domain":true}'
 from public.modules where key='website'
 on conflict(organization_id,module_id,source) do update set enabled=true,configuration=excluded.configuration;
select set_config('test.template_document',/*DOCUMENT*/::text,true);
set local request.jwt.claim.sub='55555555-5555-4555-8555-555555555555';
set local role authenticated;
do $$declare t uuid=gen_random_uuid(); doc jsonb=current_setting('test.template_document')::jsonb;begin
 doc=jsonb_set(doc,'{theme,primary}','"#88352B"');
 perform public.website_template_save(t,0,'Construction','Reusable layout',doc);
 perform set_config('test.template_id',t::text,true);
 perform pg_temp.template_assert((select status='draft' from public.website_templates where id=t),'admin creates a draft template');
 perform pg_temp.template_denied(format('update public.website_templates set status=''published'' where id=%L',t),'direct publication denied');
end$$;
set local request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
do $$declare t uuid=current_setting('test.template_id')::uuid;doc jsonb=current_setting('test.template_document')::jsonb;begin
 perform pg_temp.template_assert(not exists(select 1 from public.website_templates where id=t),'owners cannot see unpublished templates');
 perform pg_temp.template_denied(format('select public.website_template_save(%L,0,''Unauthorized'','''',%L)',gen_random_uuid(),doc),'owner cannot create platform template');
 perform pg_temp.template_denied(format('select public.website_from_template(%L,%L,''Test'',''template-draft-denied'',%L)','dddddddd-dddd-4ddd-8ddd-dddddddddddd',t,doc),'unpublished template cannot be used');
end$$;
set local request.jwt.claim.sub='55555555-5555-4555-8555-555555555555';
do $$declare t uuid=current_setting('test.template_id')::uuid;doc jsonb;proof jsonb;begin
 select document into doc from public.website_templates where id=t;
 proof=jsonb_build_object('keyId','template-test','purpose','website.template.publish','templateId',t,'version',1,'document',doc,'expiresAt',now()+interval '5 minutes');
 perform pg_temp.template_denied(format('select public.website_template_status(%L,1,''published'',%L,''forged'')',t,proof),'unsigned template publication denied');
 perform public.website_template_status(t,1,'published',proof::text,pg_temp.template_signature(proof));
 perform pg_temp.template_denied(format('select public.website_template_save(%L,1,''Stale'','''',%L)',t,doc),'stale template edit denied');
end$$;
set local request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
do $$declare t uuid=current_setting('test.template_id')::uuid;site uuid;doc jsonb=current_setting('test.template_document')::jsonb;begin
 perform pg_temp.template_assert(exists(select 1 from public.website_templates where id=t and status='published'),'owner sees published templates');
 site=public.website_from_template('dddddddd-dddd-4ddd-8ddd-dddddddddddd',t,'RV Construction','rv-template-test',doc);
 perform set_config('test.template_site',site::text,true);
 perform pg_temp.template_assert(public.website_read('dddddddd-dddd-4ddd-8ddd-dddddddddddd',site)->'document'->'theme'->>'primary'='#88352B','company receives template theme');
 perform pg_temp.template_assert(public.website_read('dddddddd-dddd-4ddd-8ddd-dddddddddddd',site)->'document'->'settings'->>'name'='RV Construction','company branding overrides template name');
 perform pg_temp.template_assert(public.website_read('dddddddd-dddd-4ddd-8ddd-dddddddddddd',site)->>'status'='draft','copy remains an unpublished draft');
 perform pg_temp.template_denied(format('select public.website_from_template(%L,%L,''Other'',''template-other'',%L)',gen_random_uuid(),t,doc),'cross-company template creation denied');
end$$;
set local request.jwt.claim.sub='55555555-5555-4555-8555-555555555555';
do $$declare t uuid=current_setting('test.template_id')::uuid;doc jsonb;proof jsonb;begin
 select document into doc from public.website_templates where id=t;
 doc=jsonb_set(doc,'{css}','"body { color: red; }"');
 perform public.website_template_save(t,2,'Custom CSS','Requires capability',doc);
 proof=jsonb_build_object('keyId','template-test','purpose','website.template.publish','templateId',t,'version',3,'document',doc,'expiresAt',now()+interval '5 minutes');
 perform public.website_template_status(t,3,'published',proof::text,pg_temp.template_signature(proof));
end$$;
set local request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
do $$declare t uuid=current_setting('test.template_id')::uuid;doc jsonb=current_setting('test.template_document')::jsonb;begin
 perform pg_temp.template_denied(format('select public.website_from_template(%L,%L,''Blocked'',''template-code-denied'',%L)','dddddddd-dddd-4ddd-8ddd-dddddddddddd',t,doc),'template cannot bypass custom-code entitlement');
 perform pg_temp.template_assert(not exists(select 1 from public.websites where slug='template-code-denied'),'failed copy rolls back website creation');
 perform pg_temp.template_assert(public.website_read('dddddddd-dddd-4ddd-8ddd-dddddddddddd',current_setting('test.template_site')::uuid)->'document'->>'css'='','later template edits do not change company website');
end$$;
set local request.jwt.claim.sub='55555555-5555-4555-8555-555555555555';
select public.website_template_status(current_setting('test.template_id')::uuid,4,'archived');
select pg_temp.template_assert(jsonb_array_length(public.website_platform_domain_registry())>0,'platform domain registry lists companies');

do $$declare org uuid='dddddddd-dddd-4ddd-8ddd-dddddddddddd';site uuid=current_setting('test.template_site')::uuid;d uuid;proof jsonb;challenge text;begin
 perform pg_temp.template_denied(format('select public.website_read(%L,%L)',org,site),'domain administrator cannot read company draft');
 perform pg_temp.template_denied(format('select public.website_domain_add(%L,%L,''wrong-company.example.com'')',gen_random_uuid(),site),'admin must match website to company');
 d=public.website_domain_add(org,site,'rv-template.example.com');
 perform set_config('test.platform_domain',d::text,true);
 perform pg_temp.template_assert((select status='pending' from public.website_domains where id=d),'admin domain starts unverified');
 select website_domains.challenge into challenge from public.website_domains where id=d;
 proof=jsonb_build_object('keyId','template-test','purpose','website.domain','organizationId',org,'domainId',d,'hostname','rv-template.example.com','challenge',challenge,'dns',false,'tls',true,'expiresAt',now()+interval '5 minutes');
 perform pg_temp.template_denied(format('select public.website_domain_check(%L,%L,%L,''forged'')',org,d,proof),'admin cannot bypass domain proof');
 perform pg_temp.template_assert(public.website_domain_check(org,d,proof::text,pg_temp.template_signature(proof))='failed','TLS alone cannot activate domain');
 proof=jsonb_set(proof,'{dns}','true');
 perform pg_temp.template_assert(public.website_domain_check(org,d,proof::text,pg_temp.template_signature(proof))='active','admin uses the same signed DNS and TLS verification');
 perform pg_temp.template_assert(public.website_public('rv-template.example.com') is null,'verified domain cannot serve an unpublished draft');
 perform pg_temp.template_denied(format('select public.website_domain_remove(%L,%L,1)',org,d),'stale domain removal denied');
 perform public.website_domain_remove(org,d,3);
 perform pg_temp.template_assert((select status='removed' from public.website_domains where id=d),'admin can remove company domain');
end$$;
reset role;
select pg_temp.template_assert(exists(select 1 from public.website_events where website_id=current_setting('test.template_site')::uuid and action='domain.added' and created_by='55555555-5555-4555-8555-555555555555'),'domain audit retains platform actor');
set local role authenticated;

set local request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
select pg_temp.template_denied('select public.website_platform_domain_registry()','owner cannot inspect platform domain registry');
select pg_temp.template_assert(not exists(select 1 from public.website_templates where id=current_setting('test.template_id')::uuid),'archived template hidden from owners');
set local role anon;
select pg_temp.template_denied('select * from public.website_templates','anonymous template read denied');
rollback;
