-- Appended inside the canonical execution/operations fixture transaction.
reset role;
do $$declare event text;begin
 foreach event in array array['quotation.created','quotation.sent','quotation.accepted','contract.accepted','po.created','po.issued','receipt.created','inventory.changed','task.created','task.blocked','task.completed','milestone.completed','inspection.created','inspection.failed','inspection.passed','snag.created','snag.assigned','snag.review','snag.closed','handover.completed'] loop
 perform pg_temp.execution_assert(exists(select 1 from public.automation_events where event_type=event),'trusted canonical event captured: '||event);
 end loop;
 perform pg_temp.execution_assert(not private.automation_scheduled_match('dddddddd-dddd-4ddd-8ddd-dddddddddddd','invoice.overdue',jsonb_build_object('status','issued','amount','0','due_at',now()-interval '1 day'),now()),'paid invoice cancels overdue reminder eligibility');
 perform pg_temp.execution_assert(not private.automation_scheduled_match('dddddddd-dddd-4ddd-8ddd-dddddddddddd','task.overdue',jsonb_build_object('status','done','due_at',now()-interval '1 day'),now()),'completed task cancels reminder eligibility');
 perform pg_temp.execution_assert(not private.automation_scheduled_match('dddddddd-dddd-4ddd-8ddd-dddddddddddd','snag.overdue',jsonb_build_object('status','verified','due_at',now()-interval '1 day'),now()),'verified snag cancels reminder eligibility');
 perform pg_temp.execution_assert(not private.automation_scheduled_match('dddddddd-dddd-4ddd-8ddd-dddddddddddd','quotation.sent','{"status":"issued","current_revision":true,"customer_response":"approved"}',now()),'accepted quote cancels quote followup eligibility');
 perform pg_temp.execution_assert(private.automation_scheduled_match('dddddddd-dddd-4ddd-8ddd-dddddddddddd','inspection.failed','{"status":"failed"}',now()),'failed inspection remains actionable');
end$$;
