-- A one-company, owner-authorized ProPulse lead delivery connection.
-- Raw API grants are server-side only, never visible through authenticated RLS.
CREATE TABLE public.propulse_lead_connections (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  propulse_subject text NOT NULL CHECK (propulse_subject ~ '^propulse:[0-9]+$'),
  display_name text NOT NULL DEFAULT '',
  display_email text NOT NULL DEFAULT '',
  access_token text NOT NULL CHECK (length(access_token) BETWEEN 32 AND 256),
  token_expires_at timestamptz NOT NULL,
  connected_by uuid NOT NULL REFERENCES auth.users(id),
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz,
  sync_page integer NOT NULL DEFAULT 1 CHECK (sync_page BETWEEN 1 AND 10000)
);
ALTER TABLE public.propulse_lead_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.propulse_lead_connections FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.propulse_lead_connections FROM PUBLIC;
REVOKE ALL ON public.propulse_lead_connections FROM anon, authenticated;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.propulse_lead_connections TO service_role';
  END IF;
END $$;
COMMENT ON TABLE public.propulse_lead_connections IS
  'Service-role only: owner-paired ProPulse lead-read credential. No user-readable RLS policies. Never expose access_token to clients.';

-- Source-ID dedupe is tenant-specific and does not affect manual or sheet leads.
CREATE UNIQUE INDEX IF NOT EXISTS crm_propulse_lead_source_unique
  ON public.leads (organization_id, source_detail)
  WHERE source_detail LIKE 'propulse:%';
