// Admin bot (separate Telegram bot / token).
// Lets the team browse feedback, view stats, tune reminder settings, broadcast
// announcements, and look up individual users. Access is restricted to ADMIN_IDS.
//
// Deploy with: supabase functions deploy admin-bot --no-verify-jwt
// Broadcasts are sent through the USER bot token (BOT_TOKEN) so users receive
// them from the bot they actually started.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { btn, keyboard, makeTg } from "../_shared/telegram.ts";
import { getSettings, setSetting } from "../_shared/settings.ts";
import { BOT_TZ } from "../_shared/dates.ts";

const ADMIN_BOT_TOKEN = Deno.env.get("ADMIN_BOT_TOKEN")!;
const USER_BOT_TOKEN = Deno.env.get("BOT_TOKEN")!;
const WEBHOOK_SECRET = Deno.env.get("ADMIN_WEBHOOK_SECRET")!;
const ADMIN_IDS = (Deno.env.get("ADMIN_IDS") ?? "")
  .split(",").map((s) => Number(s.trim())).filter(Boolean);

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const tg = makeTg(ADMIN_BOT_TOKEN); // replies in the admin chat
const userTg = makeTg(USER_BOT_TOKEN); // broadcasting to end users

const isAdmin = (id: number) => ADMIN_IDS.includes(id);

const MENU = keyboard([
  [btn("📊 Статистика", "stats"), btn("🗒 Последние отзывы", "fb:0")],
  [btn("🔔 Напоминания", "rem"), btn("📢 Рассылка", "bcast")],
  [btn("🔎 Найти пользователя", "find")],
]);
const backKb = keyboard([[btn("‹ Меню", "menu")]]);

Deno.serve(async (req) => {
  if (req.headers.get("x-telegram-bot-api-secret-token") !== WEBHOOK_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }
  let update: any;
  try {
    update = await req.json();
  } catch {
    return new Response("bad request", { status: 400 });
  }
  try {
    if (update.message) await onMessage(update.message);
    else if (update.callback_query) await onCallback(update.callback_query);
  } catch (e) {
    console.error("admin handler error:", e);
  }
  return new Response("ok");
});

// --------------------------------------------------------------------------
// Messages
// --------------------------------------------------------------------------

async function onMessage(msg: any) {
  const chatId = msg.chat.id;
  const fromId = msg.from?.id;
  const text: string = (msg.text ?? "").trim();
  if (!fromId || !isAdmin(fromId)) {
    return void tg.sendMessage(chatId, "⛔ Доступ только для администраторов.");
  }

  if (text === "/start" || text === "/menu") {
    await clearState(fromId);
    return showMenu(chatId);
  }

  const st = await getState(fromId);
  if (st?.action === "await_broadcast") {
    await setState(fromId, "confirm_broadcast", { text });
    const total = await count("users", { promo_issued: true });
    return void tg.sendMessage(
      chatId,
      `📢 <b>Предпросмотр рассылки</b> (получат ${total} чел.):\n\n${escapeHtml(text)}`,
      keyboard([[btn("✅ Отправить", "bcast:send"), btn("✖️ Отмена", "menu")]]),
    );
  }
  if (st?.action === "await_find") {
    await clearState(fromId);
    return findUser(chatId, text);
  }

  return showMenu(chatId);
}

// --------------------------------------------------------------------------
// Callbacks
// --------------------------------------------------------------------------

async function onCallback(cq: any) {
  const fromId = cq.from.id;
  const chatId = cq.message?.chat?.id ?? fromId;
  const data: string = cq.data;
  if (!isAdmin(fromId)) return void tg.answerCallbackQuery(cq.id, "⛔");
  await tg.answerCallbackQuery(cq.id);

  if (data === "menu") return showMenu(chatId);
  if (data === "stats") return showStats(chatId);
  if (data.startsWith("fb:")) return showFeedback(chatId, Number(data.slice(3)));
  if (data === "rem") return showReminderSettings(chatId);
  if (data === "rem:toggle") {
    const s = await getSettings(db);
    await setSetting(db, "reminder_enabled", !s.reminder_enabled);
    return showReminderSettings(chatId);
  }
  if (data === "rem:esc") {
    const s = await getSettings(db);
    await setSetting(db, "escalation_enabled", !s.escalation_enabled);
    return showReminderSettings(chatId);
  }
  if (data.startsWith("rem:hour:")) {
    const s = await getSettings(db);
    const next = (s.reminder_hour + Number(data.slice(9)) + 24) % 24;
    await setSetting(db, "reminder_hour", next);
    return showReminderSettings(chatId);
  }
  if (data === "bcast") {
    await setState(fromId, "await_broadcast");
    return void tg.sendMessage(chatId, "Пришлите текст рассылки одним сообщением.", backKb);
  }
  if (data === "bcast:send") {
    const st = await getState(fromId);
    await clearState(fromId);
    if (st?.action === "confirm_broadcast" && st.payload?.text) {
      return broadcast(chatId, String(st.payload.text));
    }
    return void tg.sendMessage(chatId, "Нечего отправлять.", backKb);
  }
  if (data === "find") {
    await setState(fromId, "await_find");
    return void tg.sendMessage(chatId, "Введите email, @username или Telegram ID.", backKb);
  }
  if (data.startsWith("u:")) {
    const [, act, id] = data.split(":");
    if (act === "pause" || act === "resume") {
      await db.from("users").update({
        reminder_enabled: act === "resume",
        updated_at: new Date().toISOString(),
      }).eq("id", Number(id));
    }
    return showUser(chatId, Number(id));
  }
  if (data.startsWith("ufb:")) return showUserFeedback(chatId, Number(data.slice(4)));
}

// --------------------------------------------------------------------------
// Views
// --------------------------------------------------------------------------

function showMenu(chatId: number) {
  return tg.sendMessage(chatId, "🛠 <b>Админ-панель Flymind</b>\nВыберите раздел:", MENU);
}

async function showStats(chatId: number) {
  const { data } = await db.rpc("admin_stats");
  const s = data ?? {};
  const sources = (s.top_sources ?? [])
    .map((r: any) => `  • ${escapeHtml(r.source)}: <b>${r.n}</b>`).join("\n") || "  —";
  await tg.sendMessage(
    chatId,
    `📊 <b>Статистика</b>\n\n` +
      `👥 Пользователей: <b>${s.users ?? 0}</b>\n` +
      `🎟 Получили промокод: <b>${s.onboarded ?? 0}</b>\n` +
      `✅ Активных: <b>${s.active ?? 0}</b>  ·  🟡 риск: <b>${s.at_risk ?? 0}</b>  ·  🔴 ушли: <b>${s.churned ?? 0}</b>\n` +
      `📝 Фидбэк сегодня: <b>${s.feedback_today ?? 0}</b>\n` +
      `💬 Всего записей фидбэка: <b>${s.feedback_rows ?? 0}</b>\n` +
      `⭐ Средняя оценка: <b>${s.avg_rating ?? "—"}</b>\n\n` +
      `<b>Источники (топ-5):</b>\n${sources}`,
    backKb,
  );
}

const PAGE = 5;
async function showFeedback(chatId: number, offset: number) {
  const { data } = await db
    .from("feedback")
    .select("feedback_date, rating, text, users(username, first_name, email)")
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE - 1);

  const rows = data ?? [];
  if (rows.length === 0) {
    return void tg.sendMessage(chatId, "Отзывов пока нет.", backKb);
  }

  const body = rows.map((r: any) => {
    const u = r.users ?? {};
    const who = u.username ? `@${u.username}` : (u.first_name ?? u.email ?? "—");
    const stars = r.rating ? `${"⭐".repeat(r.rating)} ` : "";
    const txt = r.text ? `\n${escapeHtml(r.text)}` : "";
    return `<b>${r.feedback_date}</b> · ${escapeHtml(who)}\n${stars}${txt}`;
  }).join("\n\n──────────\n\n");

  const nav: any[] = [];
  if (offset > 0) nav.push(btn("‹ Назад", `fb:${Math.max(0, offset - PAGE)}`));
  if (rows.length === PAGE) nav.push(btn("Дальше ›", `fb:${offset + PAGE}`));

  await tg.sendMessage(
    chatId,
    `🗒 <b>Отзывы</b> (${offset + 1}–${offset + rows.length})\n\n${body}`,
    keyboard([nav, [btn("‹ Меню", "menu")]].filter((r) => r.length)),
  );
}

async function showReminderSettings(chatId: number) {
  const s = await getSettings(db);
  const onOff = s.reminder_enabled ? "включены ✅" : "выключены ⛔";
  const esc = s.escalation_enabled ? "вкл ✅" : "выкл ⛔";
  await tg.sendMessage(
    chatId,
    `🔔 <b>Настройки напоминаний</b>\n\n` +
      `Статус: <b>${onOff}</b>\n` +
      `Время рассылки: <b>${String(s.reminder_hour).padStart(2, "0")}:00</b> (${BOT_TZ})\n` +
      `Эскалация (риск/ушёл): <b>${esc}</b>`,
    keyboard([
      [btn(s.reminder_enabled ? "Выключить" : "Включить", "rem:toggle")],
      [btn("− час", "rem:hour:-1"), btn("+ час", "rem:hour:1")],
      [btn(`Эскалация: ${s.escalation_enabled ? "выкл" : "вкл"}`, "rem:esc")],
      [btn("‹ Меню", "menu")],
    ]),
  );
}

async function findUser(chatId: number, q: string) {
  const clean = q.replace(/^@/, "");
  let query = db.from("users").select("*").limit(5);
  query = /^\d+$/.test(clean)
    ? query.eq("id", Number(clean))
    : query.or(`email.ilike.%${clean}%,username.ilike.%${clean}%`);
  const { data } = await query;
  const rows = data ?? [];
  if (rows.length === 0) {
    return void tg.sendMessage(chatId, "Никого не нашёл.", backKb);
  }
  if (rows.length === 1) return renderUser(chatId, rows[0]);

  await tg.sendMessage(
    chatId,
    "Нашёл несколько — выберите:",
    keyboard([
      ...rows.map((u: any) => [btn(
        `${u.username ? "@" + u.username : (u.first_name ?? u.id)} · ${u.email ?? "—"}`,
        `ufb:${u.id}`,
      )]),
      [btn("‹ Меню", "menu")],
    ]),
  );
}

async function showUser(chatId: number, id: number) {
  const { data } = await db.from("users").select("*").eq("id", id).maybeSingle();
  if (!data) return void tg.sendMessage(chatId, "Не найдено.", backKb);
  return renderUser(chatId, data);
}

function renderUser(chatId: number, u: any) {
  const who = u.username ? `@${u.username}` : (u.first_name ?? `id ${u.id}`);
  return tg.sendMessage(
    chatId,
    `👤 <b>${escapeHtml(who)}</b>\n\n` +
      `Email: <code>${escapeHtml(u.email ?? "—")}</code>\n` +
      `ID: <code>${u.id}</code>\n` +
      `Источник: ${escapeHtml(u.source ?? "—")}\n` +
      `Статус: <b>${u.status}</b>\n` +
      `Серия: <b>${u.streak}</b> (рекорд ${u.longest_streak})\n` +
      `Всего дней с фидбэком: <b>${u.total_feedback}</b>\n` +
      `Последний фидбэк: ${u.last_feedback_date ?? "—"}\n` +
      `Напоминания: <b>${u.reminder_enabled ? "вкл" : "выкл"}</b>`,
    keyboard([
      [btn("🗒 Его отзывы", `ufb:${u.id}`)],
      [u.reminder_enabled
        ? btn("🔕 Выкл. напоминания", `u:pause:${u.id}`)
        : btn("🔔 Вкл. напоминания", `u:resume:${u.id}`)],
      [btn("‹ Меню", "menu")],
    ]),
  );
}

async function showUserFeedback(chatId: number, id: number) {
  const { data } = await db
    .from("feedback")
    .select("feedback_date, rating, text")
    .eq("user_id", id)
    .order("created_at", { ascending: false })
    .limit(10);
  const rows = data ?? [];
  const body = rows.length
    ? rows.map((r: any) =>
      `<b>${r.feedback_date}</b> ${r.rating ? "⭐".repeat(r.rating) : ""}\n${escapeHtml(r.text ?? "—")}`
    ).join("\n\n")
    : "Отзывов нет.";
  await tg.sendMessage(
    chatId,
    `🗒 <b>Отзывы пользователя</b>\n\n${body}`,
    keyboard([[btn("‹ Профиль", `u:show:${id}`)], [btn("‹ Меню", "menu")]]),
  );
}

async function broadcast(chatId: number, text: string) {
  const { data } = await db
    .from("users")
    .select("chat_id")
    .eq("promo_issued", true);
  const targets = data ?? [];
  let ok = 0, fail = 0;
  await tg.sendMessage(chatId, `Отправляю ${targets.length} сообщений…`);
  for (const t of targets) {
    const res = await userTg.sendMessage(t.chat_id, text);
    res.ok ? ok++ : fail++;
    await new Promise((r) => setTimeout(r, 60));
  }
  await tg.sendMessage(chatId, `✅ Готово. Доставлено: <b>${ok}</b>, ошибок: <b>${fail}</b>.`, backKb);
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

async function count(table: string, eq: Record<string, unknown>) {
  let q = db.from(table).select("id", { count: "exact", head: true });
  for (const [k, v] of Object.entries(eq)) q = q.eq(k, v);
  const { count } = await q;
  return count ?? 0;
}

interface AdminState {
  action: string;
  payload?: Record<string, any>;
}
async function getState(adminId: number): Promise<AdminState | null> {
  const { data } = await db
    .from("admin_state").select("action, payload").eq("admin_id", adminId).maybeSingle();
  return data as AdminState | null;
}
async function setState(adminId: number, action: string, payload?: Record<string, any>) {
  await db.from("admin_state").upsert({
    admin_id: adminId, action, payload: payload ?? null, updated_at: new Date().toISOString(),
  });
}
async function clearState(adminId: number) {
  await db.from("admin_state").delete().eq("admin_id", adminId);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
