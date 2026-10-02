begin;
-- Defence in depth: even privileged application RPCs cannot mutate frozen content.
create function private.guard_quotation_revision() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'Revision deletion forbidden' using errcode='23514';end if;
 if old.status<>'draft' then
  if (to_jsonb(new)-array['status','superseded_at','cancelled_at','updated_at','version']) is distinct from (to_jsonb(old)-array['status','superseded_at','cancelled_at','updated_at','version']) then raise exception 'Frozen revision' using errcode='23514';end if;
  if new.status is distinct from old.status and not(old.status='issued' and new.status in ('superseded','cancelled')) then raise exception 'Invalid transition' using errcode='23514';end if;
 elsif new.status not in ('draft','issued','cancelled') then raise exception 'Invalid transition' using errcode='23514';end if;
 if new.organization_id<>old.organization_id or new.quotation_id<>old.quotation_id or new.project_id<>old.project_id or new.revision_number<>old.revision_number then raise exception 'Stable identity required' using errcode='23514';end if;
 return new;
end $$;
create trigger quotation_revision_guard before update or delete on public.quotation_revisions for each row execute function private.guard_quotation_revision();

create function private.guard_quotation_line() returns trigger language plpgsql security definer set search_path='' as $$
declare old_revision uuid;new_revision uuid;
begin
 if tg_table_name='quotation_items' then
  if tg_op<>'INSERT' then old_revision=old.revision_id;end if;
  if tg_op<>'DELETE' then new_revision=new.revision_id;end if;
 else
  if tg_op<>'INSERT' then select revision_id into old_revision from public.quotation_items where id=old.item_id;end if;
  if tg_op<>'DELETE' then select revision_id into new_revision from public.quotation_items where id=new.item_id;end if;
 end if;
 -- Locks serialize line writes with issuance, independent of the caller.
 perform 1 from public.quotation_revisions where id in(old_revision,new_revision) order by id for update;
 if exists(select 1 from public.quotation_revisions where id in(old_revision,new_revision) and status<>'draft') then raise exception 'Frozen revision lines' using errcode='23514';end if;
 if tg_op='DELETE' then return old;end if;
 if tg_op='UPDATE' and (old.organization_id<>new.organization_id or old.id<>new.id or old_revision is distinct from new_revision) then raise exception 'Stable line identity required' using errcode='23514';end if;
 return new;
end $$;
create trigger quotation_line_guard before insert or update or delete on public.quotation_items for each row execute function private.guard_quotation_line();
create trigger quotation_cost_guard before insert or update or delete on public.quotation_item_costs for each row execute function private.guard_quotation_line();

-- Aggregation is exact numeric arithmetic over attested line snapshots. Catalog
-- pricing remains exclusively in the existing TypeScript pricing engine.
create function private.quotation_totals(revision uuid,discount jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare gross numeric;subtotal numeric;optional_amount numeric;reduction numeric;amount numeric;
begin
 if not private.valid_quote_discount(discount) then raise exception 'Invalid discount' using errcode='22023';end if;
 select coalesce(sum((snapshot->>'effective_amount')::numeric) filter(where not optional),0),coalesce(sum((snapshot->>'final_amount')::numeric) filter(where not optional),0),coalesce(sum((snapshot->>'final_amount')::numeric) filter(where optional),0) into gross,subtotal,optional_amount from public.quotation_items where revision_id=revision;
 reduction=case discount->>'kind' when 'none' then 0 when 'fixed' then (discount->>'value')::numeric else subtotal*(discount->>'value')::numeric/100 end;
 if reduction>subtotal then raise exception 'Discount exceeds amount' using errcode='22023';end if;
 amount=subtotal-reduction;
 if exists(select 1 from public.quotation_items where revision_id=revision and not optional and (snapshot->>'minimum_amount')::numeric*subtotal>(snapshot->>'final_amount')::numeric*amount) then raise exception 'Below minimum selling amount' using errcode='22023';end if;
 return jsonb_build_object('line_subtotal',trim_scale(gross)::text,'line_discount',trim_scale(gross-subtotal)::text,'subtotal',trim_scale(subtotal)::text,'revision_discount',trim_scale(reduction)::text,'final_amount',trim_scale(amount)::text,'optional_amount',trim_scale(optional_amount)::text);
end $$;
revoke all on function private.guard_quotation_revision(),private.guard_quotation_line(),private.quotation_totals(uuid,jsonb) from public,anon,authenticated;
commit;
