# Flymind — Telegram-боты для сбора обратной связи

Два бота для приложения **Flymind** (АВА-терапия дома), работающие на одной
бесплатной инфраструктуре **Supabase** (БД + serverless-функции + планировщик):

1. **Пользовательский бот** — рассказывает о сервисе, собирает email, выдаёт
   промокод и ссылки на App Store / Google Play, а взамен ежедневно собирает
   обратную связь и шлёт напоминания.
2. **Админский бот** — отдельный бот для команды: статистика, просмотр отзывов,
   настройки напоминаний, рассылки, поиск пользователей.

## Пользовательский бот — флоу

```
/start[ source] ─► приветствие + оффер ─► «Начать!»
        ─► ввод email ─► «Получить промокод»
        ─► промокод + инструкция + кнопки «Скачать iOS/Android»   → статус active
                                  │
        напоминание раз в день: оценка ⭐1–5 ─► (по желанию) комментарий
        или просто текст в чат ───┴─► засчитывается как фидбэк (1 раз/день)
                                       streak 🔥 растёт; пропуск дня — сброс серии
```

Оптимизации флоу:
- **Меньше кликов** — промокод, инструкция и ссылки выдаются одним шагом.
- **Структурированный фидбэк** — оценка 1–5 + опциональный комментарий
  (свободный текст тоже принимается). Одна запись на день, оценка и комментарий
  объединяются.
- **Трекинг источника из Instagram** — deep-link `t.me/ВАШ_БОТ?start=insta_осень`
  сохраняется в `users.source` (атрибуция по первому касанию).

Напоминания шлёт cron (`send-reminders`), запускаемый **раз в час**; функция сама
проверяет настроенный час и эскалирует молчунов: 3+ дней → `at_risk`,
7+ дней → `churned`, с уведомлением админу. Все настройки меняются из админ-бота
без редеплоя.

## Админский бот

Доступ только для Telegram ID из `ADMIN_IDS`. Разделы (инлайн-меню):

- 📊 **Статистика** — пользователи, промокоды, активные/риск/ушедшие, фидбэк за
  сегодня, средняя оценка, топ источников.
- 🗒 **Последние отзывы** — с пагинацией.
- 🔔 **Напоминания** — вкл/выкл, час рассылки (± кнопки), эскалация.
- 📢 **Рассылка** — сообщение всем (через пользовательский бот) с подтверждением.
- 🔎 **Поиск пользователя** — по email / @username / ID: профиль, его отзывы,
  пауза/возобновление напоминаний.

## Архитектура

| Компонент | Технология (бесплатно) |
|-----------|------------------------|
| Пользовательский вебхук | Edge Function `telegram-bot` |
| Админский вебхук | Edge Function `admin-bot` |
| Напоминания | Edge Function `send-reminders` + `pg_cron` (ежечасно) |
| База данных | Supabase Postgres (`users`, `feedback`, `settings`, `admin_state`) |

```
supabase/
  config.toml                  # verify_jwt = false для всех функций
  migrations/
    0001_init.sql              # таблицы users/feedback
    0002_admin_and_feedback.sql# source/rating, settings, admin_state, admin_stats()
  functions/
    _shared/                   # telegram, messages (RU), users, settings, dates
    telegram-bot/index.ts      # пользовательский вебхук
    admin-bot/index.ts         # админский вебхук
    send-reminders/index.ts    # ежечасный cron, шлёт в настроенный час
scripts/set-webhook.sh         # регистрация вебхуков + меню команд
.env.example                   # список секретов
```

## Деплой через GitHub Actions (без терминала)

Самый простой путь — всё деплоит workflow `.github/workflows/deploy.yml`.

1. Создай **personal access token** Supabase: https://supabase.com/dashboard/account/tokens
2. В репозитории: **Settings → Secrets and variables → Actions → New repository secret** — добавь:

   | Secret | Значение |
   |--------|----------|
   | `SUPABASE_ACCESS_TOKEN` | токен из шага 1 (`sbp_...`) |
   | `SUPABASE_PROJECT_REF` | `snsroffugjanyhhghqhp` |
   | `SUPABASE_DB_PASSWORD` | пароль БД (Project Settings → Database) |
   | `BOT_TOKEN`, `ADMIN_BOT_TOKEN` | токены ботов от @BotFather |
   | `WEBHOOK_SECRET`, `ADMIN_WEBHOOK_SECRET`, `CRON_SECRET` | любые длинные строки |
   | `PROMO_CODE`, `IOS_URL`, `ANDROID_URL` | промокод и ссылки на сторы |
   | `ADMIN_CHAT_ID`, `ADMIN_IDS` | твой Telegram ID (@userinfobot) |
   | `BOT_TZ` | `Asia/Almaty` |

3. Вкладка **Actions → Deploy bots to Supabase → Run workflow**.

Workflow сам применит миграции, зальёт секреты, задеплоит 3 функции,
зарегистрирует вебхуки и поставит ежечасный cron. Дальше — `/start`
основному боту и `/menu` админскому.

## Деплой через CLI (альтернатива)

Нужен [Supabase CLI](https://supabase.com/docs/guides/cli) и бесплатный проект Supabase.
Можно одной командой: заполни `.env` (см. `.env.example`) и запусти
`PROJECT_REF=<ref> ./scripts/deploy.sh`. Либо вручную по шагам:

1. **Создайте двух ботов** у [@BotFather](https://t.me/BotFather): основной
   (`BOT_TOKEN`) и админский (`ADMIN_BOT_TOKEN`).

2. **Свяжите проект и примените схему:**
   ```bash
   supabase login
   supabase link --project-ref <YOUR_PROJECT_REF>
   supabase db push                     # применит обе миграции
   ```

3. **Заполните секреты** (`.env.example` → `.env`, впишите значения):
   ```bash
   cp .env.example .env
   # отредактируйте .env: токены, секреты вебхуков, ссылки, ADMIN_CHAT_ID, ADMIN_IDS
   supabase secrets set --env-file ./.env
   ```
   > `SUPABASE_URL` и `SUPABASE_SERVICE_ROLE_KEY` Supabase подставляет сам.

4. **Задеплойте функции:**
   ```bash
   supabase functions deploy telegram-bot
   supabase functions deploy admin-bot
   supabase functions deploy send-reminders
   ```

5. **Зарегистрируйте вебхуки и меню:**
   ```bash
   BOT_TOKEN=... WEBHOOK_SECRET=... \
   ADMIN_BOT_TOKEN=... ADMIN_WEBHOOK_SECRET=... \
   PROJECT_REF=... ./scripts/set-webhook.sh
   ```

6. **Включите ежечасный cron.** В `supabase/migrations/0002_admin_and_feedback.sql`
   раскомментируйте блок `cron.schedule` (`0 * * * *`), подставьте
   `YOUR_PROJECT_REF` и `YOUR_CRON_SECRET` (= ваш `CRON_SECRET`) и выполните в
   SQL-редакторе Supabase. Если ранее создавали ежедневный job из 0001 —
   удалите его (`select cron.unschedule('flymind-daily-reminders');`).

Готово: напишите основному боту `/start`, админскому — `/menu`.

## Полезно знать

- **Источники из Instagram:** в рекламе используйте ссылку вида
  `https://t.me/ВАШ_БОТ?start=insta_<кампания>` — источник попадёт в статистику.
- **Свой `ADMIN_CHAT_ID` / `ADMIN_IDS`:** узнать ID — у [@userinfobot](https://t.me/userinfobot).
- **Бесплатный Supabase «засыпает» после 7 дней простоя** — ежечасный cron
  поддерживает проект активным.
- **Смена промокода/ссылок:** меняйте секреты `PROMO_CODE`, `IOS_URL`,
  `ANDROID_URL` (`supabase secrets set ...`), редеплой не нужен.
- **Смена времени/режима напоминаний:** через админ-бот → 🔔 Напоминания.
- **Проверить рассылку напоминаний вручную:** вызвать `send-reminders?force=1`
  с заголовком `Authorization: Bearer <CRON_SECRET>`.

## Локальная проверка

```bash
supabase start
supabase functions serve --no-verify-jwt --env-file ./.env
```
Для приёма апдейтов локально пробросьте порт наружу (ngrok/cloudflared) и
укажите URL в `set-webhook.sh`.
