-- Stop Quotation Studio before it creates a customer/project if the
-- application server's HMAC key is not synchronized with the database.
-- The verifier never returns the stored key, signs data, or bypasses tenant RBAC.
begin;

create function public.quotation_signing_preflight(
  p_message text, p_signature text
)
returns boolean language plpgsql stable security definer
set search_path = ''
as $preflight$
declare
  v_proof jsonb;
  v_org uuid;
begin
  if octet_length(p_message) > 4096 then
    raise exception 'Invalid attestation' using errcode = '42501';
  end if;
  v_proof := private.verify_quotation_message(
    p_message, p_signature, 'commit'
  );
  if v_proof->>'action' is distinct from 'create' then
    raise exception 'Invalid attestation' using errcode = '42501';
  end if;
  v_org := (v_proof->>'organization_id')::uuid;
  if not private.commercial_access(v_org,'quotation.create','quotation')
     or not private.commercial_access(v_org,'quotation.view','quotation')
     or not private.commercial_access(v_org,'customer.create','customers')
     or not private.commercial_access(v_org,'customer.view','customers')
     or not private.commercial_access(v_org,'project.create','projects')
     or not private.commercial_access(v_org,'project.view','projects')
  then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  return true;
end
$preflight$;

revoke all on function public.quotation_signing_preflight(text,text)
from public, anon, authenticated;
grant execute on function public.quotation_signing_preflight(text,text)
to authenticated;

commit;
