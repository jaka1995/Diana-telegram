-- Flymind feedback bot — schema + daily reminder schedule.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.users (
  id                bigint primary key,            -- Telegram user id
  chat_id           bigint not null,
  username          text,
  first_name        text,
  email             text,
  state             text not null default 'new',   -- new | awaiting_email | onboarded | active
  promo_issued      boolean not null default false,
  platform          text,
  status            text not null default 'active', -- active | at_risk | churned
  reminder_enabled  boolean not null default true,
  streak            int not null default 0,
  longest_streak    int not null default 0,
  total_feedback    int not null default 0,
  missed_count      int not null default 0,
  last_feedback_at  timestamptz,
  last_feedback_date date,
  last_reminder_at  timestamptz,
  onboarded_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.feedback (
  id            bigserial primary key,
  user_id       bigint not null references public.users(id) on delete cascade,
  feedback_date date not null,
  text          text,
  created_at    timestamptz not null default now()
);

create index if not exists feedback_user_date_idx on public.feedback (user_id, feedback_date);
create index if not exists users_reminder_idx on public.users (promo_issued, reminder_enabled);

-- Lock the tables down: only the service role (used by the edge functions,
-- which bypasses RLS) may read/write. No public policies are defined.
alter table public.users    enable row level security;
alter table public.feedback enable row level security;

-- ---------------------------------------------------------------------------
-- Daily reminder schedule
-- ---------------------------------------------------------------------------
-- Replace YOUR_PROJECT_REF and YOUR_CRON_SECRET below, then run this block
-- (cron.schedule cannot use placeholders, so edit it before applying).
-- 15:00 UTC == 20:00 Asia/Almaty.
--
-- select cron.schedule(
--   'flymind-daily-reminders',
--   '0 15 * * *',
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
-- To remove the schedule later:
-- select cron.unschedule('flymind-daily-reminders');
