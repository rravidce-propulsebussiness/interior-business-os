begin;
do $$declare definition text;begin
 select pg_get_functiondef('public.brochure_public(text,text,text,uuid)'::regprocedure) into definition;
 definition=replace(definition,'kind text;begin','metric_kind text;begin');definition=replace(definition,'kind=''download''','metric_kind=''download''');definition=replace(definition,'kind=p_action','metric_kind=p_action');definition=replace(definition,'values(b.id,current_date,kind,1)','values(b.id,current_date,metric_kind,1)');execute definition;
 select pg_get_functiondef('public.brochure_submit_lead(text,text,text,jsonb,text)'::regprocedure) into definition;
 definition=replace(definition,'bucket timestamptz','limit_bucket timestamptz');definition=replace(definition,'bucket=date_trunc','limit_bucket=date_trunc');definition=replace(definition,'values(b.id,bucket,1)','values(b.id,limit_bucket,1)');execute definition;
end$$;
commit;
