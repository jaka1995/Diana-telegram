#!/usr/bin/env bash
# Registers Telegram webhooks for both bots.
#
# User bot (required):
#   BOT_TOKEN=... WEBHOOK_SECRET=... PROJECT_REF=... ./scripts/set-webhook.sh
#
# Admin bot (optional, set these too to register it):
#   ADMIN_BOT_TOKEN=... ADMIN_WEBHOOK_SECRET=... PROJECT_REF=... ./scripts/set-webhook.sh
#
set -euo pipefail

: "${PROJECT_REF:?set PROJECT_REF (your-project-ref from the Supabase URL)}"

register () { # token secret function_name
  local token="$1" secret="$2" fn="$3"
  curl -sS "https://api.telegram.org/bot${token}/setWebhook" \
    -H 'content-type: application/json' \
    -d "{\"url\":\"https://${PROJECT_REF}.supabase.co/functions/v1/${fn}\",\"secret_token\":\"${secret}\",\"allowed_updates\":[\"message\",\"callback_query\"],\"drop_pending_updates\":true}"
  echo
}

# --- User bot ---
if [[ -n "${BOT_TOKEN:-}" && -n "${WEBHOOK_SECRET:-}" ]]; then
  echo "Registering user bot webhook…"
  register "$BOT_TOKEN" "$WEBHOOK_SECRET" "telegram-bot"

  curl -sS "https://api.telegram.org/bot${BOT_TOKEN}/setMyCommands" \
    -H 'content-type: application/json' \
    -d '{"commands":[
      {"command":"start","description":"Запустить бота"},
      {"command":"promo","description":"Получить промокод"},
      {"command":"help","description":"Что умеет этот бот?"},
      {"command":"pause","description":"Отключить напоминания"},
      {"command":"resume","description":"Включить напоминания"}
    ]}'
  echo
fi

# --- Admin bot ---
if [[ -n "${ADMIN_BOT_TOKEN:-}" && -n "${ADMIN_WEBHOOK_SECRET:-}" ]]; then
  echo "Registering admin bot webhook…"
  register "$ADMIN_BOT_TOKEN" "$ADMIN_WEBHOOK_SECRET" "admin-bot"

  curl -sS "https://api.telegram.org/bot${ADMIN_BOT_TOKEN}/setMyCommands" \
    -H 'content-type: application/json' \
    -d '{"commands":[
      {"command":"menu","description":"Открыть админ-панель"}
    ]}'
  echo
fi
