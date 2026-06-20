# Flymind — Telegram feedback bot

Бот для приложения **Flymind** (АВА-терапия дома). Рассказывает о сервисе,
собирает email, выдаёт промокод и ссылки на App Store / Google Play, а взамен
просит пользователя оставлять обратную связь **раз в день** и присылает
напоминания.

Полностью на бесплатной инфраструктуре **Supabase** (одно место для БД,
serverless-функций и планировщика).

## Как это работает

```
/start ─► приветствие + оффер ─► «Начать!»
        ─► ввод email ─► «Получить промокод»
        ─► промокод (Freeaba60kz) ─► «Инструкция»
        ─► инструкция + кнопки «Скачать на iOS / Android»  → статус active
                                  │
        любое сообщение в чат ────┴─► засчитывается как обратная связь (1 раз/день)
                                       streak 🔥 растёт; пропуск дня — сброс серии
```

**Напоминания** шлёт ежедневный cron (`send-reminders`):
- день без фидбэка → обычное напоминание;
- 3+ дней → статус `at_risk`, мягкое «начните заново», уведомление админу;
- 7+ дней → статус `churned`, уведомление админу.

Бот не управляет подпиской внутри приложения (это делает промокод), поэтому
доступ не блокируется — вместо этого ведётся учёт серий и эскалация
напоминаний. Все сообщения сохраняются в таблицу `feedback`.

## Архитектура

| Компонент | Технология (бесплатно) |
|-----------|------------------------|
| Webhook-обработчик | Supabase Edge Function `telegram-bot` (Deno/TS) |
| Напоминания | Supabase Edge Function `send-reminders` + `pg_cron` |
| База данных | Supabase Postgres (`users`, `feedback`) |

```
supabase/
  config.toml                  # verify_jwt = false для обеих функций
  migrations/0001_init.sql     # таблицы + расписание cron
  functions/
    _shared/                   # telegram, messages (RU), users, dates
    telegram-bot/index.ts      # вебхук
    send-reminders/index.ts    # ежедневная рассылка
scripts/set-webhook.sh         # регистрация вебхука + меню команд
.env.example                   # список секретов
```

## Деплой (один раз)

Нужен [Supabase CLI](https://supabase.com/docs/guides/cli) и бесплатный проект Supabase.

1. **Создайте бота** у [@BotFather](https://t.me/BotFather), получите `BOT_TOKEN`.

2. **Свяжите проект и примените схему:**
   ```bash
   supabase login
   supabase link --project-ref <YOUR_PROJECT_REF>
   supabase db push          # применит migrations/0001_init.sql
   ```

3. **Заполните секреты** (скопируйте `.env.example` → `.env`, впишите значения):
   ```bash
   cp .env.example .env
   # отредактируйте .env (BOT_TOKEN, WEBHOOK_SECRET, CRON_SECRET, ссылки, ADMIN_CHAT_ID)
   supabase secrets set --env-file ./.env
   ```
   > `SUPABASE_URL` и `SUPABASE_SERVICE_ROLE_KEY` Supabase подставляет сам — их задавать не нужно.

4. **Задеплойте функции:**
   ```bash
   supabase functions deploy telegram-bot
   supabase functions deploy send-reminders
   ```
   (`verify_jwt=false` уже прописан в `config.toml`.)

5. **Зарегистрируйте вебхук и меню команд:**
   ```bash
   BOT_TOKEN=... WEBHOOK_SECRET=... PROJECT_REF=... ./scripts/set-webhook.sh
   ```

6. **Включите ежедневный cron.** Откройте `supabase/migrations/0001_init.sql`,
   раскомментируйте блок `cron.schedule`, подставьте `YOUR_PROJECT_REF` и
   `YOUR_CRON_SECRET` (= ваш `CRON_SECRET`) и выполните его в SQL-редакторе
   Supabase. Время `0 15 * * *` = 20:00 по Алматы.

Готово. Напишите боту `/start`.

## Полезно знать

- **Бесплатный проект Supabase «засыпает» после 7 дней простоя** — ежедневный
  cron сам поддерживает его активным, так что паузы не будет.
- **Узнать свой `ADMIN_CHAT_ID`:** напишите боту [@userinfobot](https://t.me/userinfobot).
- **Чтение фидбэка:** таблица `feedback` в дашборде Supabase (Table Editor / SQL).
  Команда `/stats` в чате (только админ) показывает сводку.
- **Сменить промокод/ссылки:** поменяйте секреты `PROMO_CODE`, `IOS_URL`,
  `ANDROID_URL` (`supabase secrets set ...`) — редеплой кода не нужен.

## Локальная проверка

```bash
supabase start
supabase functions serve telegram-bot --no-verify-jwt --env-file ./.env
```
Для приёма апдейтов локально пробросьте порт наружу (ngrok/cloudflared) и
укажите этот URL в `set-webhook.sh`.
