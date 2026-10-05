-- Operator-reviewed installation ONLY on the separately identified staging project.
-- Supply psql variables project_ref, marker_id, expires_at. No application migration.
\set ON_ERROR_STOP on
begin;
create schema if not exists acceptance_control;
revoke all on schema acceptance_control from public,anon,authenticated;
create table if not exists acceptance_control.target (
 singleton boolean primary key default true check(singleton),
 environment text not null check(environment='staging'),
 project_ref text not null check(project_ref ~ '^[a-z]{20}$'),
 marker_id uuid not null unique,
 expires_at timestamptz not null
);
create table if not exists acceptance_control.organizations (
 organization_id uuid primary key references public.organizations(id),
 marker_id uuid not null references acceptance_control.target(marker_id),
 created_at timestamptz not null default now()
);
revoke all on all tables in schema acceptance_control from public,anon,authenticated;
-- Existing marker is never silently overwritten. Remove/renew it in a reviewed
-- staging-only operator action after reviewing registered organizations.
insert into acceptance_control.target(environment,project_ref,marker_id,expires_at)
 values('staging', :'project_ref', :'marker_id'::uuid, :'expires_at'::timestamptz);
commit;
