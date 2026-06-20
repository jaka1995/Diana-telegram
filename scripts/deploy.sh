#!/usr/bin/env bash
# One-shot deploy: link project, apply schema, set secrets, deploy all three
# functions, and register both Telegram webhooks.
#
# Prereqs:
#   1) Supabase CLI installed + logged in:  supabase login
#   2) A filled ./.env  (copy from .env.example)
#   3) PROJECT_REF set (or exported in the environment)
#
# Usage:
#   PROJECT_REF=snsroffugjanyhhghqhp ./scripts/deploy.sh
#
set -euo pipefail
cd "$(dirname "$0")/.."

: "${PROJECT_REF:?set PROJECT_REF (e.g. snsroffugjanyhhghqhp)}"

if [[ ! -f .env ]]; then
  echo "❌ .env not found. Copy .env.example to .env and fill it in." >&2
  exit 1
fi

# Load .env so the webhook step has the tokens/secrets.
set -a; source ./.env; set +a

echo "▶ 1/5 Linking project $PROJECT_REF…"
supabase link --project-ref "$PROJECT_REF"

echo "▶ 2/5 Applying database migrations…"
supabase db push

echo "▶ 3/5 Setting function secrets…"
supabase secrets set --env-file ./.env

echo "▶ 4/5 Deploying edge functions…"
supabase functions deploy telegram-bot
supabase functions deploy admin-bot
supabase functions deploy send-reminders

echo "▶ 5/5 Registering Telegram webhooks…"
./scripts/set-webhook.sh

cat <<EOF

✅ Deploy done.

ONE manual step left — enable the hourly reminder cron.
Open Supabase Dashboard → SQL Editor and run:

select cron.schedule(
  'flymind-hourly-reminders',
  '0 * * * *',
  \$\$
  select net.http_post(
    url     := 'https://${PROJECT_REF}.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ${CRON_SECRET}'
    ),
    body    := '{}'::jsonb
  );
  \$\$
);

Then test: send /start to @FlyMindReviewBot and /menu to @FlyMindAdminBot.
EOF
