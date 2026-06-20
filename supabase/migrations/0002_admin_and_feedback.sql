-- Flow optimizations + admin bot support.

-- ---------------------------------------------------------------------------
-- Schema additions
-- ---------------------------------------------------------------------------

alter table public.users add column if not exists source         text;
alter table public.users add column if not exists pending_action text;

alter table public.feedback add column if not exists rating int
  check (rating between 1 and 5);

-- One feedback row per user per day (rating set + text appended).
create unique index if not exists feedback_user_day_uniq
  on public.feedback (user_id, feedback_date);

create index if not exists users_source_idx on public.users (source);

-- Runtime settings editable from the admin bot (no redeploy needed).
create table if not exists public.settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.settings enable row level security;

insert into public.settings (key, value) values
  ('reminder_enabled',   'true'::jsonb),
  ('reminder_hour',      '20'::jsonb),
  ('escalation_enabled', 'true'::jsonb)
on conflict (key) do nothing;

-- Transient conversation state for the admin bot (broadcast / search input).
create table if not exists public.admin_state (
  admin_id   bigint primary key,
  action     text,
  payload    jsonb,
  updated_at timestamptz not null default now()
);
alter table public.admin_state enable row level security;

-- ---------------------------------------------------------------------------
-- Stats aggregate for the admin bot
-- ---------------------------------------------------------------------------

create or replace function public.admin_stats()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'users',               (select count(*) from users),
    'onboarded',           (select count(*) from users where promo_issued),
    'active',              (select count(*) from users where status = 'active'  and promo_issued),
    'at_risk',             (select count(*) from users where status = 'at_risk'),
    'churned',             (select count(*) from users where status = 'churned'),
    'feedback_today',      (select count(*) from users where last_feedback_date = (now() at time zone 'Asia/Almaty')::date),
    'feedback_rows',       (select count(*) from feedback),
    'avg_rating',          (select round(avg(rating)::numeric, 2) from feedback where rating is not null),
    'top_sources',         (
      select coalesce(jsonb_agg(s), '[]'::jsonb) from (
        select coalesce(source, '—') as source, count(*) as n
        from users
        group by 1 order by 2 desc limit 5
      ) s
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- Reminder schedule (run HOURLY; the function checks the configured hour).
-- Replace placeholders and run in the SQL editor. To change the run cadence
-- later, unschedule and reschedule.
-- ---------------------------------------------------------------------------
--
-- select cron.schedule(
--   'flymind-hourly-reminders',
--   '0 * * * *',
--   $$
--   select net.http_post(
--     url     := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-reminders',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer YOUR_CRON_SECRET'
--     ),
--     body    := '{}'::jsonb
--   );
--   $$
-- );
--
-- If you created the daily job from migration 0001, remove it:
-- select cron.unschedule('flymind-daily-reminders');
