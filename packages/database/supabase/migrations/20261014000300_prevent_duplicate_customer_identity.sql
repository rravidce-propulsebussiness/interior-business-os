-- Prevent repeat CRNs when two quote requests create the same client at once.
-- Existing records are not altered: administrators must separately reconcile
-- legacy duplicates and every linked project, quotation and financial record.
begin;

create or replace function private.customer_identity_phone_key(p_value text)
returns text
language sql immutable
set search_path=''
as $$
  select case
    when left(digits,2)='91' and length(digits)=12 then right(digits,10)
    when left(digits,2)='00' then substring(digits from 3)
    else digits
  end
  from (select regexp_replace(coalesce(p_value,''),'[^0-9]','','g') as digits) x;
$$;

create or replace function private.prevent_duplicate_customer_identity()
returns trigger
language plpgsql security definer set search_path=''
as $$
declare
  incoming_name text := lower(btrim(coalesce(new.display_name,'')));
  incoming_phone text := private.customer_identity_phone_key(new.phone);
  incoming_email text := lower(btrim(coalesce(new.email,'')));
begin
  -- Serialize customer creation inside this company. A read-only preflight
  -- alone is race-prone and creates two CRNs on concurrent requests.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.organization_id::text, 20261014)
  );

  if incoming_name<>'' and (incoming_phone<>'' or incoming_email<>'')
     and exists (
       select 1 from public.customers existing
       where existing.organization_id=new.organization_id
         and lower(btrim(existing.display_name))=incoming_name
         and (
           (incoming_phone<>'' and
             private.customer_identity_phone_key(existing.phone)=incoming_phone)
           or
           (incoming_email<>'' and lower(btrim(coalesce(existing.email,'')))=incoming_email)
         )
     )
  then
    raise exception 'Customer already exists. Choose the existing CRN instead of creating another.'
      using errcode='23505';
  end if;
  return new;
end;
$$;

drop trigger if exists customers_prevent_duplicate_identity on public.customers;
create trigger customers_prevent_duplicate_identity
  before insert on public.customers
  for each row execute function private.prevent_duplicate_customer_identity();

revoke all on function private.customer_identity_phone_key(text),
  private.prevent_duplicate_customer_identity() from public, anon, authenticated;
commit;
