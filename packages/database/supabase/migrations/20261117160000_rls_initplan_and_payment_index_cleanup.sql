-- Reduce per-row auth.uid() evaluation in the four read policies flagged
-- by the Supabase performance advisor. Keep all existing authorization checks.
-- Scalar subselects are evaluated as initPlans for statement-constant auth.
ALTER POLICY notification_read ON public.notifications
  USING (
    recipient_id = (SELECT auth.uid())
    AND private.has_permission(organization_id, 'notification.view')
    AND private.automation_event_access(organization_id, event_id)
  );

ALTER POLICY notification_preferences_read ON public.notification_preferences
  USING (
    user_id = (SELECT auth.uid())
    AND private.has_permission(organization_id, 'notification.manage_preferences')
  );

ALTER POLICY website_templates_read ON public.website_templates
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND (
      status = 'published'
      OR private.has_platform_permission('platform.entitlements.manage')
    )
  );

ALTER POLICY website_domains_platform_read ON public.website_domains
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND private.has_platform_permission('platform.entitlements.manage')
    AND private.has_platform_permission('platform.organizations.manage')
  );

-- This standalone index duplicates the existing UNIQUE constraint index on
-- (organization_id, contract_id, id). It is not owned by a constraint and no
-- foreign key uses it as its supporting referenced index.
DROP INDEX IF EXISTS public.stage_payment_item_org_contract_id;
