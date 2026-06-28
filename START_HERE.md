# 🚀 START HERE — Flymind боты

Это готовый проект двух Telegram-ботов (пользовательский + админский) на Supabase.

## Что внутри
- `supabase/functions/telegram-bot/` — пользовательский бот (оффер → email → промокод → ежедневный фидбэк)
- `supabase/functions/admin-bot/` — админ-бот (статистика, отзывы, настройки напоминаний, рассылка, поиск)
- `supabase/functions/send-reminders/` — ежечасный cron напоминаний
- `supabase/migrations/` — схема БД
- `scripts/deploy_api.sh` — деплой в один запуск (нужен только access-токен)
- `README.md` — подробная документация
- `DEPLOY.md` — короткая инструкция по запуску

## Как поднять (на своём Mac)

```bash
# 1. зависимости
brew install supabase/tap/supabase jq

# 2. конфиг: создай .env из шаблона и впиши значения
cp .env.example .env
#   открой .env и заполни: BOT_TOKEN, ADMIN_BOT_TOKEN, секреты, ADMIN_IDS=@WiseOracle и т.д.
#   (готовые значения — в нашей переписке / в DEPLOY.md)

# 3. деплой
export SUPABASE_ACCESS_TOKEN=sbp_...   # твой токен из supabase.com/dashboard/account/tokens
./scripts/deploy_api.sh
```

Скрипт сам применит схему, зальёт секреты, задеплоит 3 функции, поставит вебхуки
обоих ботов и ежечасный cron.

## Проверка
- `/start` → **@FlyMindReviewBot**
- `/menu` → **@FlyMindAdminBot** (вход по @username из `ADMIN_IDS`)

## Важно про безопасность
`.env` уже в `.gitignore` — секреты в git не попадают. Токены, которые
светились в переписке, после первого успешного запуска перевыпусти
(`/revoke` в @BotFather + новый Supabase-токен) и обнови в `.env`.

Полные детали — в `README.md`.
