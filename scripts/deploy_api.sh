#!/usr/bin/env bash
# Deploy everything using ONLY a Supabase access token (no DB password needed).
# Schema + cron go through the Management API; functions/secrets through the CLI
# (which also authenticates with the access token). Webhooks via the Bot API.
#
# Prereqs:
#   - Supabase CLI installed (https://supabase.com/docs/guides/cli)
#   - jq, curl
#   - a filled ./.env  (copy from .env.example)
#   - export SUPABASE_ACCESS_TOKEN=sbp_...   (or put it in your shell env)
#
# Run:
#   export SUPABASE_ACCESS_TOKEN=sbp_xxx
#   ./scripts/deploy_api.sh
#
set -euo pipefail
cd "$(dirname "$0")/.."

: "${SUPABASE_ACCESS_TOKEN:?export SUPABASE_ACCESS_TOKEN=sbp_...}"
[[ -f .env ]] || { echo "❌ .env not found (copy from .env.example)"; exit 1; }

set -a; source ./.env; set +a
REF="${SUPABASE_PROJECT_REF:?set SUPABASE_PROJECT_REF in .env}"
API="https://api.supabase.com/v1/projects/${REF}"

run_sql_file () { # $1 = .sql path
  echo "   • $1"
  jq -Rs '{query: .}' "$1" > /tmp/sql.json
  curl -fsS -X POST "${API}/database/query" \
    -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    --data @/tmp/sql.json > /dev/null
}

run_sql () { # $1 = sql string
  jq -n --arg q "$1" '{query:$q}' > /tmp/sql.json
  curl -fsS -X POST "${API}/database/query" \
    -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    --data @/tmp/sql.json > /dev/null
}

echo "▶ 1/5 Applying schema (Management API)…"
for f in supabase/migrations/*.sql; do run_sql_file "$f"; done

echo "▶ 2/5 Setting function secrets…"
# Strip reserved SUPABASE_* keys, comments and blanks before uploading.
grep -vE '^(SUPABASE_|#|$)' .env > /tmp/fn.env || true
supabase secrets set --project-ref "$REF" --env-file /tmp/fn.env
rm -f /tmp/fn.env

echo "▶ 3/5 Deploying edge functions…"
for fn in telegram-bot admin-bot send-reminders; do
  supabase functions deploy "$fn" --project-ref "$REF"
done

echo "▶ 4/5 Registering Telegram webhooks…"
PROJECT_REF="$REF" ./scripts/set-webhook.sh

echo "▶ 5/5 Scheduling hourly reminder cron…"
run_sql "do \$\$ begin perform cron.unschedule('flymind-hourly-reminders'); exception when others then null; end \$\$;
select cron.schedule('flymind-hourly-reminders','0 * * * *',\$\$
  select net.http_post(
    url := 'https://${REF}.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ${CRON_SECRET}'),
    body := '{}'::jsonb);
\$\$);"

echo ""
echo "✅ Deployed. Test: /start → @FlyMindReviewBot, /menu → @FlyMindAdminBot"
