\set ON_ERROR_STOP on
begin;

-- Isolated test: the SQL transaction rolls back the temporary signing key.
insert into private.quotation_signing_keys(singleton,secret_hex)
values (true,repeat('8f',32))
on conflict (singleton) do update set secret_hex=excluded.secret_hex;

with p as (
  select jsonb_build_object(
    'operation','commit',
    'actor','11111111-1111-4111-8111-111111111111',
    'organization_id','dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    'action','create',
    'nonce',gen_random_uuid(),
    'expires',floor(extract(epoch from now()) + 90)::bigint
  )::text as message
), signed as (
  select message,encode(
    extensions.hmac(convert_to(message,'UTF8'),decode(repeat('8f',32),'hex'),'sha256'),
    'hex'
  ) as signature from p
)
select set_config('app.quote_test_message',message,true) is not null,
       set_config('app.quote_test_signature',signature,true) is not null
from signed;

select set_config(
  'request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true
) is not null;
set local role authenticated;

do $assert$
declare denied boolean := false;
begin
  if public.quotation_signing_preflight(
    current_setting('app.quote_test_message'),
    current_setting('app.quote_test_signature')
  ) is distinct from true then
    raise exception 'Valid owner-signed quotation preflight was rejected';
  end if;

  begin
    perform public.quotation_signing_preflight(
      current_setting('app.quote_test_message'),repeat('0',64)
    );
  exception when sqlstate '42501' then
    denied := true;
  end;
  if not denied then
    raise exception 'An incorrect application signing key was accepted';
  end if;
  raise notice 'PASS: owner signature preflight rejects mismatched keys';
end
$assert$;

rollback;
