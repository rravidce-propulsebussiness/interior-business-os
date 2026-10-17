-- Reading invoice appearance and company salaries must never take row locks.
-- Reuse the existing read-only, entitlement-aware authorization helper.
begin;
create or replace function public.gst_standard_invoice_format(p_org uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare v_selected jsonb;
begin
  if p_org is null then
    perform private.require_platform('platform.catalog.view');
  else
    perform private.finance_require_read(p_org,'invoice.view');
  end if;
  if p_org is not null then
    select jsonb_build_object(
      'templateId',t.id,'name',t.name,
      'config',t.config || coalesce(c.config_override,'{}'::jsonb)
    ) into v_selected
    from private.gst_company_template_choices c
    join private.gst_invoice_templates t on t.id=c.template_id
    where c.organization_id=p_org and t.status='active' and t.kind='sales_invoice';
  end if;
  if v_selected is not null then return v_selected; end if;
  return (select jsonb_build_object(
      'templateId',template_id,'name',name,'config',config
    ) from private.gst_invoice_standard where id=true);
end $fn$;

create or replace function public.company_salary_list(p_org uuid,p_month date)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare v_rows jsonb;
begin
  perform private.finance_require_read(p_org,'payment.view');
  if p_month is null or extract(day from p_month)<>1 then
    raise exception 'Invalid salary month' using errcode='22023';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',d.id,'employeeName',d.employee_name,'salaryMonth',d.salary_month,
    'gross',d.gross,'deductions',d.deductions,'net',d.net,'status',d.status,
    'paymentMethod',d.payment_method,'paymentReference',d.payment_reference,
    'paidAt',d.paid_at,'notes',d.notes
  ) order by d.employee_name,d.id),'[]'::jsonb)
  into v_rows from (
    select * from private.company_salary_entries
    where organization_id=p_org and salary_month=p_month
    order by employee_name,id limit 1000
  ) d;
  return v_rows;
end $fn$;
commit;
