-- Tenant-owned settings that are not supplied by the ProPulse OAuth userinfo.
-- ProPulse remains the authority for source company name, linked account and services.
-- Never store bank data in auth metadata or public quotation branding.
CREATE TABLE private.organization_identity_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  trade_name text NOT NULL DEFAULT '',
  business_type text NOT NULL DEFAULT '',
  pan text NOT NULL DEFAULT '',
  cin text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  website text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  state text NOT NULL DEFAULT '',
  pin text NOT NULL DEFAULT '',
  categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  bank_holder text NOT NULL DEFAULT '',
  bank_account text NOT NULL DEFAULT '',
  bank_ifsc text NOT NULL DEFAULT '',
  bank_name text NOT NULL DEFAULT '',
  bank_branch text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT identity_categories_array CHECK (jsonb_typeof(categories) = 'array'),
  CONSTRAINT identity_pan_shape CHECK (pan = '' OR pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
  CONSTRAINT identity_pin_shape CHECK (pin = '' OR pin ~ '^[0-9]{6}$'),
  CONSTRAINT identity_ifsc_shape CHECK (bank_ifsc = '' OR bank_ifsc ~ '^[A-Z]{4}0[A-Z0-9]{6}$')
);
ALTER TABLE private.organization_identity_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.organization_identity_settings FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.organization_identity_settings FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.organization_identity_settings_read(p_org uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $settings$
BEGIN
  IF NOT private.has_permission(p_org,'organization.manage') THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN (
    SELECT jsonb_build_object(
      'tradeName',s.trade_name, 'businessType',s.business_type,
      'pan',s.pan,'cin',s.cin,'phone',s.phone,'email',s.email,
      'website',s.website,'address',s.address,'city',s.city,
      'state',s.state,'pin',s.pin,'categories',s.categories,
      'bankHolder',s.bank_holder,'bankAccount',s.bank_account,
      'bankIfsc',s.bank_ifsc,'bankName',s.bank_name,'bankBranch',s.bank_branch,
      'updatedAt',s.updated_at
    )
    FROM private.organization_identity_settings s
    WHERE s.organization_id=p_org
  );
END;
$settings$;
REVOKE ALL ON FUNCTION public.organization_identity_settings_read(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.organization_identity_settings_read(uuid) TO authenticated;

CREATE FUNCTION public.organization_identity_settings_save(p_org uuid,p_input jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $settings$
DECLARE
  input record;
  options constant text[] := ARRAY[
    'Residential Construction','Commercial Construction','Interior Design & Execution',
    'Renovation / Remodeling','Real Estate Services','Structural Consulting',
    'Project Management','Other Services'
  ];
BEGIN
  IF NOT private.has_permission(p_org,'organization.manage') THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_input IS NULL OR jsonb_typeof(p_input) <> 'object' THEN
    RAISE EXCEPTION 'Invalid company details' USING ERRCODE='22023';
  END IF;
  SELECT
    btrim(coalesce(p_input->>'tradeName','')) AS trade_name,
    btrim(coalesce(p_input->>'businessType','')) AS business_type,
    upper(btrim(coalesce(p_input->>'pan',''))) AS pan,
    upper(btrim(coalesce(p_input->>'cin',''))) AS cin,
    btrim(coalesce(p_input->>'phone','')) AS phone,
    btrim(coalesce(p_input->>'email','')) AS email,
    btrim(coalesce(p_input->>'website','')) AS website,
    btrim(coalesce(p_input->>'address','')) AS address,
    btrim(coalesce(p_input->>'city','')) AS city,
    btrim(coalesce(p_input->>'state','')) AS state,
    btrim(coalesce(p_input->>'pin','')) AS pin,
    coalesce(p_input->'categories','[]'::jsonb) AS categories,
    btrim(coalesce(p_input->>'bankHolder','')) AS bank_holder,
    btrim(coalesce(p_input->>'bankAccount','')) AS bank_account,
    upper(btrim(coalesce(p_input->>'bankIfsc',''))) AS bank_ifsc,
    btrim(coalesce(p_input->>'bankName','')) AS bank_name,
    btrim(coalesce(p_input->>'bankBranch','')) AS bank_branch
  INTO input;
  IF length(input.trade_name)>200 OR length(input.business_type)>80
     OR length(input.pan)>10 OR length(input.cin)>25
     OR length(input.phone)>40 OR length(input.email)>254
     OR length(input.website)>255 OR length(input.address)>1000
     OR length(input.city)>100 OR length(input.state)>100
     OR length(input.pin)>6 OR length(input.bank_holder)>200
     OR length(input.bank_account)>34 OR length(input.bank_ifsc)>11
     OR length(input.bank_name)>120 OR length(input.bank_branch)>160
     OR (input.email<>'' AND input.email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
     OR (input.website<>'' AND input.website !~* '^https://[^[:space:]]+$')
     OR (input.bank_account<>'' AND input.bank_account !~ '^[0-9]{6,34}$')
     OR jsonb_typeof(input.categories)<>'array'
     OR jsonb_array_length(input.categories)>8
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements_text(input.categories) cat(value)
       WHERE NOT (cat.value = ANY(options))
     )
  THEN RAISE EXCEPTION 'Invalid company settings' USING ERRCODE='22023';
  END IF;
  INSERT INTO private.organization_identity_settings AS original (
    organization_id,trade_name,business_type,pan,cin,phone,email,website,address,
    city,state,pin,categories,bank_holder,bank_account,bank_ifsc,bank_name,
    bank_branch,updated_at,updated_by
  ) VALUES (
    p_org,input.trade_name,input.business_type,input.pan,input.cin,input.phone,
    input.email,input.website,input.address,input.city,input.state,input.pin,
    input.categories,input.bank_holder,input.bank_account,input.bank_ifsc,
    input.bank_name,input.bank_branch,now(),(select auth.uid())
  )
  ON CONFLICT (organization_id) DO UPDATE SET
    trade_name=excluded.trade_name,business_type=excluded.business_type,
    pan=excluded.pan,cin=excluded.cin,phone=excluded.phone,email=excluded.email,
    website=excluded.website,address=excluded.address,city=excluded.city,
    state=excluded.state,pin=excluded.pin,categories=excluded.categories,
    bank_holder=excluded.bank_holder,bank_account=excluded.bank_account,
    bank_ifsc=excluded.bank_ifsc,bank_name=excluded.bank_name,
    bank_branch=excluded.bank_branch,updated_at=now(),
    updated_by=(select auth.uid());
  INSERT INTO public.audit_logs(
    actor_user_id,organization_id,action,entity_type,entity_id,metadata
  ) VALUES (
    (select auth.uid()),p_org,'organization.identity.updated','organization',
    p_org::text,jsonb_build_object('updatedBy','settings')
  );
END;
$settings$;
REVOKE ALL ON FUNCTION public.organization_identity_settings_save(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.organization_identity_settings_save(uuid,jsonb) TO authenticated;
