-- Phase 11B: keep the JSON row array intact when appending subsequent pages.
-- Existing permissions, export limits and source authorization remain authoritative.
begin;
create or replace function public.report_snapshot_create(p_organization_id uuid,p_kind text,p_filters jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare report jsonb;batch jsonb;rows jsonb;page integer=1;id uuid;begin
 perform private.automation_require(p_organization_id,'report.export');
 report=public.report_read(p_organization_id,p_kind,p_filters||'{"page":1}');
 if (report->>'total')::integer>5000 then raise exception 'Narrow report filters to at most 5000 rows before exporting' using errcode='22023';end if;
 rows=report->'rows';
 while page*25<(report->>'total')::integer loop
 page=page+1;batch=public.report_read(p_organization_id,p_kind,p_filters||jsonb_build_object('page',page));rows=rows||(batch->'rows');
 end loop;
 report=jsonb_set(report,'{rows}',rows)||jsonb_build_object('page',1,'page_size',jsonb_array_length(rows),'organization_name',(select o.name from public.organizations o where o.id=p_organization_id),'generated_by',auth.uid(),'renderer_version',1);
 insert into public.report_snapshots(organization_id,kind,filters,data,created_by) values(p_organization_id,p_kind,p_filters-'page',report,auth.uid()) returning report_snapshots.id into id;
 perform private.automation_audit(p_organization_id,'report.snapshot.created','report_snapshots',id);return id;
end$$;
commit;
