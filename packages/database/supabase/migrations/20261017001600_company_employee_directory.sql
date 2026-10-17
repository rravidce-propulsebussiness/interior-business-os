-- Private, tenant-scoped employee HR profiles. These are not login memberships.
-- Existing Team & Roles controls remain the sole source of application access.
BEGIN;
CREATE TABLE private.company_employee_directory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  employee_code text NOT NULL CHECK (employee_code ~ '^EMP-[0-9]{3,}$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 160),
  role text NOT NULL CHECK (length(btrim(role)) BETWEEN 2 AND 100),
  department text NOT NULL DEFAULT 'Office Staff'
    CHECK (department IN ('Office Staff','Site Team','Management','Other')),
  phone text NOT NULL DEFAULT '' CHECK (length(phone)<=30),
  email text NOT NULL DEFAULT '' CHECK (length(email)<=254),
  address text NOT NULL DEFAULT '' CHECK (length(address)<=500),
  city text NOT NULL DEFAULT '' CHECK (length(city)<=120),
  work_location text NOT NULL DEFAULT '' CHECK (length(work_location)<=200),
  date_of_birth date,
  joining_date date,
  emergency_name text NOT NULL DEFAULT '' CHECK (length(emergency_name)<=120),
  emergency_phone text NOT NULL DEFAULT '' CHECK (length(emergency_phone)<=30),
  salary numeric(12,2) CHECK (salary>=0 AND salary<=9999999999.99),
  salary_type text NOT NULL DEFAULT 'monthly' CHECK (salary_type IN ('monthly','daily','hourly')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  UNIQUE (organization_id,employee_code),
  UNIQUE (organization_id,id)
);
CREATE INDEX company_employee_directory_org_idx ON private.company_employee_directory
  (organization_id,status,employee_code);
ALTER TABLE private.company_employee_directory ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.company_employee_directory FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.company_employee_directory FROM PUBLIC,anon,authenticated;

CREATE TABLE private.company_employee_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('aadhaar','pan','passport','driving_licence','other')),
  original_name text NOT NULL CHECK(length(original_name) BETWEEN 1 AND 200),
  mime_type text NOT NULL CHECK(mime_type IN
    ('application/pdf','image/jpeg','image/png','image/webp')),
  storage_key text NOT NULL,
  verification text NOT NULL DEFAULT 'pending'
    CHECK (verification IN ('pending','verified','rejected')),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  uploaded_by uuid DEFAULT auth.uid(),
  FOREIGN KEY(organization_id,employee_id)
    REFERENCES private.company_employee_directory(organization_id,id) ON DELETE CASCADE,
  UNIQUE (organization_id,employee_id,kind)
);
CREATE INDEX company_employee_documents_org_idx ON private.company_employee_documents
  (organization_id,employee_id);
ALTER TABLE private.company_employee_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.company_employee_documents FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.company_employee_documents FROM PUBLIC,anon,authenticated;

CREATE TABLE private.company_employee_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  attendance_date date NOT NULL,
  status text NOT NULL CHECK(status IN ('present','absent','leave','half_day')),
  notes text NOT NULL DEFAULT '' CHECK(length(notes)<=300),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid DEFAULT auth.uid(),
  FOREIGN KEY(organization_id,employee_id)
    REFERENCES private.company_employee_directory(organization_id,id) ON DELETE CASCADE,
  UNIQUE(organization_id,employee_id,attendance_date)
);
CREATE INDEX company_employee_attendance_org_idx
  ON private.company_employee_attendance(organization_id,attendance_date DESC);
ALTER TABLE private.company_employee_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.company_employee_attendance FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.company_employee_attendance FROM PUBLIC,anon,authenticated;

-- Return only a company's records. Compensation needs independent payment.view.
CREATE FUNCTION public.company_employee_list(p_org uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE result jsonb;
BEGIN
  PERFORM private.require_permission(p_org,'team.manage');
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',e.id,'code',e.employee_code,'name',e.name,'role',e.role,
    'department',e.department,'phone',e.phone,'email',e.email,
    'address',e.address,'city',e.city,'workLocation',e.work_location,
    'dateOfBirth',e.date_of_birth,'joiningDate',e.joining_date,
    'emergencyName',e.emergency_name,'emergencyPhone',e.emergency_phone,
    'salary',CASE WHEN private.has_permission(p_org,'payment.view')
      THEN e.salary ELSE NULL END,
    'salaryType',e.salary_type,'status',e.status,
    'documents',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id',d.id,'kind',d.kind,'fileName',d.original_name,
      'verification',d.verification,'uploadedAt',d.uploaded_at
    ) ORDER BY d.kind) FROM private.company_employee_documents d
      WHERE d.organization_id=p_org AND d.employee_id=e.id),'[]'::jsonb)
  ) ORDER BY e.employee_code),'[]'::jsonb)
  INTO result FROM (SELECT * FROM private.company_employee_directory
    WHERE organization_id=p_org ORDER BY employee_code LIMIT 1500)e;
  RETURN result;
END $fn$;

CREATE FUNCTION public.company_employee_save(p_org uuid,p_input jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_id uuid; v_name text;v_role text;v_department text;v_status text;
 v_salary numeric;v_salary_type text;v_date date;v_birth date;v_code text;
 v_email text;v_phone text;v_address text;v_city text;v_location text;
 v_emergency_name text;v_emergency_phone text;v_previous private.company_employee_directory;
BEGIN
  PERFORM private.require_permission(p_org,'team.manage');
  IF p_input IS NULL OR jsonb_typeof(p_input)<>'object' OR
      (p_input - ARRAY['id','name','role','department','phone','email','address',
        'city','workLocation','dateOfBirth','joiningDate','emergencyName',
        'emergencyPhone','salary','salaryType','status']) <> '{}'::jsonb
  THEN RAISE EXCEPTION 'Invalid employee fields' USING ERRCODE='22023'; END IF;
  v_id:=NULLIF(p_input->>'id','')::uuid;
  IF v_id IS NOT NULL THEN
    SELECT * INTO v_previous FROM private.company_employee_directory
      WHERE organization_id=p_org AND id=v_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Employee not found' USING ERRCODE='42501'; END IF;
  END IF;
  v_name:=btrim(coalesce(p_input->>'name',''));
  v_role:=btrim(coalesce(p_input->>'role',''));
  v_department:=coalesce(p_input->>'department','Office Staff');
  v_status:=coalesce(p_input->>'status','active');
  v_salary_type:=coalesce(p_input->>'salaryType','monthly');
  v_email:=btrim(coalesce(p_input->>'email',''));
  v_phone:=btrim(coalesce(p_input->>'phone',''));
  v_address:=btrim(coalesce(p_input->>'address',''));
  v_city:=btrim(coalesce(p_input->>'city',''));
  v_location:=btrim(coalesce(p_input->>'workLocation',''));
  v_emergency_name:=btrim(coalesce(p_input->>'emergencyName',''));
  v_emergency_phone:=btrim(coalesce(p_input->>'emergencyPhone',''));
  v_date:=NULLIF(p_input->>'joiningDate','')::date;
  v_birth:=NULLIF(p_input->>'dateOfBirth','')::date;
  IF length(v_name) NOT BETWEEN 2 AND 160 OR length(v_role) NOT BETWEEN 2 AND 100
    OR v_department NOT IN ('Office Staff','Site Team','Management','Other')
    OR v_status NOT IN ('active','inactive') OR
    v_salary_type NOT IN ('monthly','daily','hourly') OR length(v_phone)>30
    OR length(v_email)>254 OR (v_email<>'' AND v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
    OR length(v_address)>500 OR length(v_city)>120 OR length(v_location)>200
    OR length(v_emergency_name)>120 OR length(v_emergency_phone)>30
    OR v_date>current_date OR v_birth>current_date
  THEN RAISE EXCEPTION 'Invalid employee information' USING ERRCODE='22023'; END IF;
  IF v_id IS NOT NULL AND v_previous.salary IS NOT NULL
    AND v_previous.salary_type<>v_salary_type THEN
    PERFORM private.require_permission(p_org,'payment.record');
  END IF;
  IF p_input ? 'salary' THEN
    PERFORM private.require_permission(p_org,'payment.record');
    v_salary:=NULLIF(p_input->>'salary','')::numeric;
    IF v_salary<0 OR v_salary>9999999999.99 OR round(v_salary,2)<>v_salary
    THEN RAISE EXCEPTION 'Invalid salary' USING ERRCODE='22023'; END IF;
  ELSE v_salary:=v_previous.salary; END IF;
  IF v_id IS NULL THEN
    -- Serialize code allocation for each company: EMP-001, EMP-002, etc.
    PERFORM pg_advisory_xact_lock(hashtext(p_org::text)::bigint);
    SELECT 'EMP-'||lpad((COALESCE(max(substring(employee_code from 5)::integer),0)+1)::text,3,'0')
      INTO v_code FROM private.company_employee_directory WHERE organization_id=p_org;
    INSERT INTO private.company_employee_directory(organization_id,employee_code,
      name,role,department,phone,email,address,city,work_location,
      date_of_birth,joining_date,emergency_name,emergency_phone,salary,
      salary_type,status)
    VALUES(p_org,v_code,v_name,v_role,v_department,v_phone,v_email,v_address,v_city,
      v_location,v_birth,v_date,v_emergency_name,v_emergency_phone,
      v_salary,v_salary_type,v_status) RETURNING id INTO v_id;
  ELSE
    UPDATE private.company_employee_directory SET name=v_name,role=v_role,
      department=v_department,phone=v_phone,email=v_email,address=v_address,
      city=v_city,work_location=v_location,date_of_birth=v_birth,
      joining_date=v_date,emergency_name=v_emergency_name,
      emergency_phone=v_emergency_phone,salary=v_salary,salary_type=v_salary_type,
      status=v_status,updated_at=now()
      WHERE id=v_id AND organization_id=p_org;
  END IF;
  INSERT INTO public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id)
  VALUES(auth.uid(),p_org,'employee.saved','company_employee',v_id::text);
  RETURN v_id;
END $fn$;

CREATE FUNCTION public.company_employee_document_register(p_org uuid,p_employee uuid,
 p_kind text,p_name text,p_mime text,p_key text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_id uuid;
BEGIN
  PERFORM private.require_permission(p_org,'team.manage');
  IF p_kind NOT IN ('aadhaar','pan','passport','driving_licence','other')
   OR length(btrim(coalesce(p_name,''))) NOT BETWEEN 1 AND 200
   OR p_mime NOT IN ('application/pdf','image/jpeg','image/png','image/webp')
   OR p_key !~ ('^'||p_org::text||'/'||p_employee::text||'/[a-f0-9-]{36}$')
   OR NOT EXISTS(SELECT 1 FROM private.company_employee_directory
      WHERE id=p_employee AND organization_id=p_org)
  THEN RAISE EXCEPTION 'Invalid employee document' USING ERRCODE='22023'; END IF;
  INSERT INTO private.company_employee_documents(organization_id,employee_id,
     kind,original_name,mime_type,storage_key)
  VALUES(p_org,p_employee,p_kind,btrim(p_name),p_mime,p_key)
  ON CONFLICT (organization_id,employee_id,kind) DO UPDATE SET
    original_name=excluded.original_name,mime_type=excluded.mime_type,
    storage_key=excluded.storage_key,verification='pending',
    uploaded_at=now(),uploaded_by=auth.uid()
  RETURNING id INTO v_id;
  INSERT INTO public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id)
  VALUES(auth.uid(),p_org,'employee.document.uploaded','company_employee_document',v_id::text);
  RETURN v_id;
END $fn$;

CREATE FUNCTION public.company_employee_document_get(p_org uuid,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE record jsonb;
BEGIN
  PERFORM private.require_permission(p_org,'team.manage');
  SELECT jsonb_build_object('id',d.id,'employeeId',d.employee_id,
    'storageKey',d.storage_key,'mimeType',d.mime_type,'fileName',d.original_name,
    'verification',d.verification) INTO record
  FROM private.company_employee_documents d
  WHERE d.id=p_id AND d.organization_id=p_org;
  RETURN record;
END $fn$;

CREATE FUNCTION public.company_employee_document_verify(p_org uuid,p_id uuid,p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
  PERFORM private.require_permission(p_org,'team.manage');
  IF p_status NOT IN ('pending','verified','rejected') THEN
    RAISE EXCEPTION 'Invalid verification status' USING ERRCODE='22023';END IF;
  UPDATE private.company_employee_documents SET verification=p_status
    WHERE organization_id=p_org AND id=p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Document not found' USING ERRCODE='22023'; END IF;
  INSERT INTO public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id)
  VALUES(auth.uid(),p_org,'employee.document.reviewed','company_employee_document',p_id::text);
END $fn$;

CREATE FUNCTION public.company_employee_attendance_list(p_org uuid,p_month date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE result jsonb;
BEGIN
  PERFORM private.require_permission(p_org,'team.manage');
  IF p_month IS NULL OR extract(day from p_month)<>1 THEN
    RAISE EXCEPTION 'Invalid attendance month' USING ERRCODE='22023'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('employeeId',a.employee_id,
     'date',a.attendance_date,'status',a.status,'notes',a.notes)
     ORDER BY a.attendance_date DESC),'[]'::jsonb) INTO result
  FROM private.company_employee_attendance a
  WHERE a.organization_id=p_org AND a.attendance_date >= p_month
    AND a.attendance_date < (p_month+interval '1 month')::date;
  RETURN result;
END $fn$;

CREATE FUNCTION public.company_employee_attendance_save(p_org uuid,p_employee uuid,
 p_date date,p_status text,p_notes text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
  PERFORM private.require_permission(p_org,'team.manage');
  IF p_date IS NULL OR p_date>current_date OR p_date<current_date-interval '2 years'
    OR p_status NOT IN ('present','absent','leave','half_day')
    OR length(coalesce(p_notes,''))>300
    OR NOT EXISTS(SELECT 1 FROM private.company_employee_directory
      WHERE id=p_employee AND organization_id=p_org)
  THEN RAISE EXCEPTION 'Invalid attendance entry' USING ERRCODE='22023'; END IF;
  INSERT INTO private.company_employee_attendance(organization_id,employee_id,
    attendance_date,status,notes) VALUES(p_org,p_employee,p_date,p_status,coalesce(p_notes,''))
  ON CONFLICT(organization_id,employee_id,attendance_date) DO UPDATE
    SET status=excluded.status,notes=excluded.notes,recorded_at=now(),recorded_by=auth.uid();
  INSERT INTO public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id)
  VALUES(auth.uid(),p_org,'employee.attendance.saved','company_employee',p_employee::text);
END $fn$;

REVOKE ALL ON FUNCTION public.company_employee_list(uuid),
  public.company_employee_save(uuid,jsonb),
  public.company_employee_document_register(uuid,uuid,text,text,text,text),
  public.company_employee_document_get(uuid,uuid),
  public.company_employee_document_verify(uuid,uuid,text),
  public.company_employee_attendance_list(uuid,date),
  public.company_employee_attendance_save(uuid,uuid,date,text,text)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.company_employee_list(uuid),
  public.company_employee_save(uuid,jsonb),
  public.company_employee_document_register(uuid,uuid,text,text,text,text),
  public.company_employee_document_get(uuid,uuid),
  public.company_employee_document_verify(uuid,uuid,text),
  public.company_employee_attendance_list(uuid,date),
  public.company_employee_attendance_save(uuid,uuid,date,text,text)
  TO authenticated;

-- Salary entries created from HR records must use the stable employee UUID.
-- Preserve old manually-entered Finance records and their name-based uniqueness.
ALTER TABLE private.company_salary_entries
  ADD COLUMN IF NOT EXISTS employee_id uuid;
ALTER TABLE private.company_salary_entries
  ADD CONSTRAINT employee_salary_directory_link
  FOREIGN KEY (organization_id,employee_id)
  REFERENCES private.company_employee_directory(organization_id,id);
DROP INDEX IF EXISTS private.salary_once_per_month;
CREATE UNIQUE INDEX salary_once_per_month ON private.company_salary_entries
  (organization_id,lower(btrim(employee_name)),salary_month)
  WHERE employee_id IS NULL;
CREATE UNIQUE INDEX salary_employee_month_once ON private.company_salary_entries
  (organization_id,employee_id,salary_month)
  WHERE employee_id IS NOT NULL;

CREATE FUNCTION public.company_employee_salary_create(p_org uuid,p_employee uuid,p_month text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_employee private.company_employee_directory;v_month date;v_id uuid;
BEGIN
  PERFORM private.require_permission(p_org,'team.manage');
  PERFORM private.finance_require(p_org,'payment.record');
  IF coalesce(p_month,'') !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
  THEN RAISE EXCEPTION 'Invalid salary month' USING ERRCODE='22023';END IF;
  v_month:=(p_month||'-01')::date;
  IF v_month>date_trunc('month',current_date)::date + interval '1 month'
  THEN RAISE EXCEPTION 'Future salary month invalid' USING ERRCODE='22023';END IF;
  SELECT * INTO v_employee FROM private.company_employee_directory
  WHERE organization_id=p_org AND id=p_employee FOR SHARE;
  IF NOT FOUND OR v_employee.status<>'active'
    OR v_employee.salary_type<>'monthly' OR v_employee.salary IS NULL
    OR v_employee.salary<=0
  THEN RAISE EXCEPTION 'Active monthly salary required' USING ERRCODE='22023';END IF;
  INSERT INTO private.company_salary_entries(
    organization_id,employee_id,employee_name,salary_month,gross,deductions,notes
  ) VALUES (
    p_org,p_employee,v_employee.name,v_month,v_employee.salary,0,
    'Payroll entry for '||v_employee.employee_code||'. Confirm payment in Finance.'
  ) RETURNING id INTO v_id;
  INSERT INTO public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id)
  VALUES(auth.uid(),p_org,'salary.entry.created','company_salary',v_id::text);
  RETURN v_id;
END $fn$;
REVOKE ALL ON FUNCTION public.company_employee_salary_create(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.company_employee_salary_create(uuid,uuid,text) TO authenticated;

COMMIT;
