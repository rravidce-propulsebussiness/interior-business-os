begin;
do $$declare definition text;begin
 select pg_get_functiondef('public.brochure_submit_lead(text,text,text,jsonb,text)'::regprocedure) into definition;
 definition=replace(definition,'declare b public.brochures;','<<brochure_submission>> declare b public.brochures;');
 definition=replace(definition,'phone_normalized=phone or email<>'''' and email_normalized=email','phone_normalized=brochure_submission.phone or brochure_submission.email<>'''' and email_normalized=brochure_submission.email');
 execute definition;
end$$;
commit;
