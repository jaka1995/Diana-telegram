# Запуск ботов — короткая инструкция

Деплой делается с компьютера, где есть интернет и Supabase CLI (в облачной
песочнице Claude сеть к Supabase/Telegram закрыта политикой, поэтому оттуда
не запустить). Пароль БД не нужен — всё идёт по access-токену.

## Один блок (macOS) — скопируй целиком в терминал

```bash
# зависимости
brew install supabase/tap/supabase jq

# проект
git clone -b claude/telegram-feedback-bot-ubjsrb https://github.com/jaka1995/diana-telegram.git Diana-telegram
cd Diana-telegram

# конфиг (значения подставь свои)
cat > .env <<'EOF'
SUPABASE_PROJECT_REF=snsroffugjanyhhghqhp
BOT_TOKEN=<токен @FlyMindReviewBot>
ADMIN_BOT_TOKEN=<токен @FlyMindAdminBot>
WEBHOOK_SECRET=<любая длинная строка>
ADMIN_WEBHOOK_SECRET=<любая длинная строка>
CRON_SECRET=<любая длинная строка>
PROMO_CODE=Freeaba60kz
IOS_URL=https://apps.apple.com/app/flymind
ANDROID_URL=https://play.google.com/store/apps/details?id=com.flymind
ADMIN_CHAT_ID=
ADMIN_IDS=@WiseOracle
BOT_TZ=Asia/Almaty
EOF

# деплой
export SUPABASE_ACCESS_TOKEN=<твой sbp_... токен>
./scripts/deploy_api.sh
```

Скрипт сам: применит схему, зальёт секреты, задеплоит 3 функции,
зарегистрирует вебхуки обоих ботов и поставит ежечасный cron.

## Проверка

- `/start` → **@FlyMindReviewBot**
- `/menu` → **@FlyMindAdminBot** (вход по @username из `ADMIN_IDS`)

## Заметки

- `ADMIN_CHAT_ID` нужен числовой (узнать у @userinfobot) только для личных
  алертов админу об ушедших пользователях — на остальное не влияет.
- Linux: вместо brew поставь Supabase CLI по
  https://supabase.com/docs/guides/cli и `apt install jq`.
- Альтернатива — Supabase MCP: конфиг уже в `.mcp.json`, авторизация
  интерактивная (`claude /mcp` → supabase → Authenticate).
