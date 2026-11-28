-- Meta's Lead Ads testing tool can omit a phone value. The ingestion function
-- keeps those submissions visible in CRM with this explicit sentinel while
-- ordinary lead phone values remain restricted to the existing character set.
alter table public.leads
  drop constraint phone_character_set;

alter table public.leads
  add constraint phone_character_set check (
    phone = 'Not provided'
    or phone ~ '^(\+|00)?[0-9() .-]+$'
  );
