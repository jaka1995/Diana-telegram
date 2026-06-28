// Daily reminder job. Triggered by pg_cron (see migrations/0001_init.sql).
// Sends a reminder to every active user who hasn't given feedback today,
// escalates the message based on how long they've been silent, and flags
// at-risk / churned users for the admin.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { makeTg } from "../_shared/telegram.ts";
import { reminderText } from "../_shared/messages.ts";
import { dayDiff, localDateStr, localHour } from "../_shared/dates.ts";
import { getSettings } from "../_shared/settings.ts";
import { User } from "../_shared/users.ts";

const BOT_TOKEN = Deno.env.get("BOT_TOKEN")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET")!;
const ADMIN_CHAT_ID = Number(Deno.env.get("ADMIN_CHAT_ID") ?? "0");

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const tg = makeTg(BOT_TOKEN);

Deno.serve(async (req) => {
  // Only pg_cron (or you, manually) may trigger this.
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${CRON_SECRET}`) {
    return new Response("unauthorized", { status: 401 });
  }

  // Cron runs hourly; only act at the configured reminder hour (and if enabled).
  // Pass ?force=1 to bypass the time/enabled gate for manual testing.
  const force = new URL(req.url).searchParams.get("force") === "1";
  const settings = await getSettings(db);
  // Prefer the admin chat captured by the admin bot; fall back to the env var.
  const adminChat = Number(settings.admin_chat_id) || ADMIN_CHAT_ID;
  if (!force && (!settings.reminder_enabled || localHour() !== settings.reminder_hour)) {
    return new Response(JSON.stringify({ ok: true, skipped: true }), {
      headers: { "content-type": "application/json" },
    });
  }

  const today = localDateStr();

  // Active users who have a promo and haven't given feedback today.
  const { data, error } = await db
    .from("users")
    .select("*")
    .eq("promo_issued", true)
    .eq("reminder_enabled", true)
    .or(`last_feedback_date.is.null,last_feedback_date.neq.${today}`);

  if (error) {
    console.error("query error:", error);
    return new Response("query error", { status: 500 });
  }

  const users = (data ?? []) as User[];
  let sent = 0, newlyAtRisk = 0, newlyChurned = 0;

  for (const u of users) {
    // How many days since last feedback (since onboarding if never).
    const reference = u.last_feedback_date ??
      (u.onboarded_at ? localDateStr(new Date(u.onboarded_at)) : today);
    const daysMissed = Math.max(0, dayDiff(today, reference));

    // Win-back window: stop pestering users who churned more than 30 days ago.
    if (u.status === "churned" && daysMissed > 30) continue;

    const { text, kb } = reminderText(daysMissed, u.streak);
    const res = await tg.sendMessage(u.chat_id, text, kb);
    if (res.ok) sent++;
    // If the user blocked the bot (403), stop reminding them.
    const blocked = !res.ok && res.error_code === 403;

    // Update engagement status + streak bookkeeping. The streak only breaks
    // after a FULL missed day (daysMissed >= 2); daysMissed == 1 just means
    // "fed yesterday, not yet today" — today is still the day to continue it.
    const patch: Partial<User> = {
      missed_count: daysMissed,
      streak: daysMissed >= 2 ? 0 : u.streak,
      last_reminder_at: new Date().toISOString(),
      ...(blocked ? { reminder_enabled: false } : {}),
    };
    if (settings.escalation_enabled && daysMissed >= 7 && u.status !== "churned") {
      patch.status = "churned";
      newlyChurned++;
      await notifyAdmin(adminChat, `🔴 Пользователь ушёл (7+ дней без фидбэка): ${describe(u)}`);
    } else if (settings.escalation_enabled && daysMissed >= 3 && u.status === "active") {
      patch.status = "at_risk";
      newlyAtRisk++;
      await notifyAdmin(adminChat, `🟡 Под риском (3+ дней без фидбэка): ${describe(u)}`);
    }
    await db.from("users").update(patch).eq("id", u.id);

    // Gentle pacing to stay well under Telegram's ~30 msg/s limit.
    await new Promise((r) => setTimeout(r, 60));
  }

  const summary = `Reminders: ${sent} sent, ${newlyAtRisk} at-risk, ${newlyChurned} churned.`;
  console.log(summary);
  return new Response(JSON.stringify({ ok: true, sent, newlyAtRisk, newlyChurned }), {
    headers: { "content-type": "application/json" },
  });
});

function describe(u: User): string {
  const handle = u.username ? `@${u.username}` : (u.first_name ?? `id ${u.id}`);
  return `${handle} (${u.email ?? "без email"})`;
}

async function notifyAdmin(chatId: number, text: string) {
  if (!chatId) return;
  await tg.sendMessage(chatId, text);
}
