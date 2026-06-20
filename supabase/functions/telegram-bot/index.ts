// Telegram webhook handler.
// Deploy with: supabase functions deploy telegram-bot --no-verify-jwt
// Telegram authenticates itself via the secret-token header set on setWebhook.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { makeTg } from "../_shared/telegram.ts";
import { getOrCreateUser, submitFeedback, updateUser, User } from "../_shared/users.ts";
import { localDateStr } from "../_shared/dates.ts";
import * as M from "../_shared/messages.ts";

const BOT_TOKEN = Deno.env.get("BOT_TOKEN")!;
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET")!;
const ADMIN_CHAT_ID = Number(Deno.env.get("ADMIN_CHAT_ID") ?? "0");

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const tg = makeTg(BOT_TOKEN);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  // Reject anything that isn't a genuine Telegram webhook call.
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
    if (update.message) await handleMessage(update.message);
    else if (update.callback_query) await handleCallback(update.callback_query);
  } catch (e) {
    console.error("handler error:", e);
  }

  // Always 200 so Telegram doesn't retry-storm us.
  return new Response("ok");
});

async function handleMessage(msg: any) {
  const chatId = msg.chat.id;
  const from = msg.from;
  if (!from || from.is_bot) return;
  const text: string = (msg.text ?? "").trim();

  // Capture the Instagram deep-link source from "/start <payload>" on first contact.
  const startPayload = text.startsWith("/start ")
    ? text.slice(7).trim().slice(0, 64)
    : null;
  const user = await getOrCreateUser(db, from, chatId, startPayload);
  // Attribute a source if the user existed but didn't have one yet.
  if (startPayload && !user.source) {
    await updateUser(db, user.id, { source: startPayload });
    user.source = startPayload;
  }

  // Commands work from any state.
  if (text === "/start" || startPayload) return sendWelcome(user);
  if (text === "/help") return void tg.sendMessage(chatId, M.HELP);
  if (text === "/promo") return sendPromo(user);
  if (text === "/pause") {
    await updateUser(db, user.id, { reminder_enabled: false });
    return void tg.sendMessage(chatId, "Напоминания приостановлены. Включить снова: /resume");
  }
  if (text === "/resume") {
    await updateUser(db, user.id, { reminder_enabled: true });
    return void tg.sendMessage(chatId, "Напоминания снова включены ✅");
  }
  if (text === "/stats" && chatId === ADMIN_CHAT_ID) return sendStats(chatId);

  // Otherwise route by onboarding state.
  switch (user.state) {
    case "awaiting_email":
      return handleEmail(user, text);
    case "active":
      return handleFeedback(user, text);
    case "onboarded":
      return void tg.sendMessage(chatId, M.NUDGE_PRESS_BUTTON);
    default:
      return void tg.sendMessage(chatId, M.NUDGE_START);
  }
}

const RATE_RE = /^rate:([1-5])$/;

async function handleCallback(cq: any) {
  const data: string = cq.data;
  const from = cq.from;
  const chatId = cq.message?.chat?.id ?? from.id;
  const user = await getOrCreateUser(db, from, chatId);

  await tg.answerCallbackQuery(cq.id);

  const rate = RATE_RE.exec(data);
  if (rate) return handleRating(user, Number(rate[1]));

  switch (data) {
    case "begin":
      await updateUser(db, user.id, { state: "awaiting_email" });
      return void tg.sendMessage(chatId, M.ASK_EMAIL);
    case "get_promo":
      return sendPromo(user);
    default:
      return;
  }
}

function sendWelcome(user: User) {
  return tg.sendMessage(user.chat_id, M.WELCOME, M.welcomeKb);
}

async function handleEmail(user: User, text: string) {
  if (!EMAIL_RE.test(text)) {
    return void tg.sendMessage(user.chat_id, M.EMAIL_INVALID);
  }
  await updateUser(db, user.id, { email: text.toLowerCase(), state: "onboarded" });
  await tg.sendMessage(user.chat_id, M.EMAIL_SAVED, M.emailSavedKb);
}

async function sendPromo(user: User) {
  if (!user.email) {
    // Haven't collected email yet — restart that step.
    await updateUser(db, user.id, { state: "awaiting_email" });
    return void tg.sendMessage(user.chat_id, M.ASK_EMAIL);
  }
  // One step: promo code + instruction + store links, and mark onboarding done.
  await updateUser(db, user.id, {
    state: "active",
    promo_issued: true,
    onboarded_at: user.onboarded_at ?? new Date().toISOString(),
  });
  await tg.sendMessage(user.chat_id, M.promoText());
  await tg.sendMessage(user.chat_id, M.INSTRUCTION, M.instructionKb);
}

async function handleRating(user: User, rating: number) {
  if (user.state !== "active") return;
  const { streak } = await submitFeedback(db, user, { rating });
  await updateUser(db, user.id, { pending_action: "comment" });
  await tg.sendMessage(user.chat_id, M.ratingThanks(rating, streak));
}

async function handleFeedback(user: User, text: string) {
  if (!text) return;

  if (user.pending_action === "comment") {
    await submitFeedback(db, user, { text });
    await updateUser(db, user.id, { pending_action: null });
    return void tg.sendMessage(user.chat_id, M.COMMENT_SAVED);
  }

  const { streak, firstToday } = await submitFeedback(db, user, { text });
  const reply = firstToday ? M.feedbackThanks(streak) : M.alreadyToday(streak);
  await tg.sendMessage(user.chat_id, reply);
}

async function sendStats(chatId: number) {
  const total = await count("users", {});
  const onboarded = await count("users", { promo_issued: true });
  const today = await db
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("last_feedback_date", localDateStr());
  const fb = await count("feedback", {});

  await tg.sendMessage(
    chatId,
    `📊 <b>Статистика</b>\n` +
      `Пользователей: <b>${total}</b>\n` +
      `Получили промокод: <b>${onboarded}</b>\n` +
      `Дали фидбэк сегодня: <b>${today.count ?? 0}</b>\n` +
      `Всего сообщений с фидбэком: <b>${fb}</b>`,
  );
}

async function count(table: string, eq: Record<string, unknown>) {
  let q = db.from(table).select("id", { count: "exact", head: true });
  for (const [k, v] of Object.entries(eq)) q = q.eq(k, v);
  const { count } = await q;
  return count ?? 0;
}
