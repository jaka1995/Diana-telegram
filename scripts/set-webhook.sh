#!/usr/bin/env bash
# Registers the Telegram webhook to point at the deployed edge function.
#
# Usage:
#   BOT_TOKEN=... WEBHOOK_SECRET=... PROJECT_REF=... ./scripts/set-webhook.sh
#
set -euo pipefail

: "${BOT_TOKEN:?set BOT_TOKEN}"
: "${WEBHOOK_SECRET:?set WEBHOOK_SECRET}"
: "${PROJECT_REF:?set PROJECT_REF (your-project-ref from the Supabase URL)}"

URL="https://${PROJECT_REF}.supabase.co/functions/v1/telegram-bot"

curl -sS "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  -H 'content-type: application/json' \
  -d "$(cat <<JSON
{
  "url": "${URL}",
  "secret_token": "${WEBHOOK_SECRET}",
  "allowed_updates": ["message", "callback_query"],
  "drop_pending_updates": true
}
JSON
)"
echo

# Optional: register the command menu shown by the "Меню" button.
curl -sS "https://api.telegram.org/bot${BOT_TOKEN}/setMyCommands" \
  -H 'content-type: application/json' \
  -d '{
    "commands": [
      {"command": "start", "description": "Запустить бота"},
      {"command": "promo", "description": "Получить промокод"},
      {"command": "help", "description": "Что умеет этот бот?"},
      {"command": "pause", "description": "Отключить напоминания"},
      {"command": "resume", "description": "Включить напоминания"}
    ]
  }'
echo
