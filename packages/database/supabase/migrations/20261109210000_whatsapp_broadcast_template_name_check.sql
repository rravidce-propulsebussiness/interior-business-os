-- PostgreSQL regular expressions allow at most 255 repetitions, so the
-- original '{1,512}' check raised "invalid repetition count(s)" on every
-- broadcast insert. Check characters and length separately instead.
begin;
alter table public.whatsapp_broadcasts
  drop constraint if exists whatsapp_broadcasts_template_name_check;
alter table public.whatsapp_broadcasts
  add constraint whatsapp_broadcasts_template_name_check
    check (template_name ~ '^[a-z0-9_]+$' and length(template_name) between 1 and 512);
commit;
