-- Enable row level security on every table in the private schema.
--
-- The Supabase security advisor flagged private tables with RLS disabled.
-- No API role (anon/authenticated) is granted privileges on private tables;
-- access goes through SECURITY DEFINER functions owned by postgres, and the
-- table owner and service_role bypass RLS. Enabling RLS without policies
-- therefore changes nothing for current access paths and denies any future
-- accidental grant by default.
--
-- Production had this applied manually on 2026-11-16; this migration is
-- idempotent so it is safe to run there again.
do $$
declare
  t record;
begin
  for t in
    select c.relname
    from pg_class c
    where c.relnamespace = 'private'::regnamespace
      and c.relkind in ('r', 'p')
      and not c.relrowsecurity
  loop
    execute format('alter table private.%I enable row level security', t.relname);
  end loop;
end
$$;
