\set ON_ERROR_STOP on
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$
begin
 begin
  perform public.platform_user_directory();
  raise exception 'FAILED: ordinary tenant obtained global user directory';
 exception when insufficient_privilege then null;end;
end$$;

select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',true);
do $$
declare d jsonb;u jsonb;org uuid;role_id uuid;
begin
 d=public.platform_user_directory('','all','',null,1,'newest');
 if jsonb_typeof(d->'rows')<>'array'
   or (d->'stats'->>'totalUsers')::integer<4
   or jsonb_typeof(d->'stats'->'organizations')<>'number'
 then raise exception 'FAILED: actual user cards and summary counts unavailable';end if;
 u=public.platform_user_profile('11111111-1111-4111-8111-111111111111');
 if u->>'email' is null or jsonb_array_length(u->'companies')<1 then
  raise exception 'FAILED: owner profile lacks linked companies';end if;
 if jsonb_typeof(public.platform_user_company_choices())<>'array' then
  raise exception 'FAILED: company role assignment choices missing';end if;
 if (public.platform_user_directory('','all','invalid',null,1,'newest')->>'total')::integer is not null then
  raise exception 'FAILED: invalid status was accepted';end if;
 exception when invalid_parameter_value then null;
end$$;
do $$
begin
 begin
  perform public.platform_user_status_set('55555555-5555-4555-8555-555555555555','suspended');
  raise exception 'FAILED: admin could suspend own account';
 exception when insufficient_privilege then null;end;
 begin
  perform public.platform_user_status_set('11111111-1111-4111-8111-111111111111','suspended');
  raise exception 'FAILED: owner account suspension was allowed';
 exception when insufficient_privilege then null;end;
end$$;
rollback;
