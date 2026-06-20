// Daily reminder job. Triggered by pg_cron (see migrations/0001_init.sql).
// Sends a reminder to every active user who hasn't given feedback today,
// escalates the message based on how long they've been silent, and flags
// at-risk / churned users for the admin.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { makeTg } from "../_shared/telegram.ts";
import { reminderText } from "../_shared/messages.ts";
import { dayDiff, localDateStr } from "../_shared/dates.ts";
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

    const { text, kb } = reminderText(daysMissed, u.streak);
    const res = await tg.sendMessage(u.chat_id, text, kb ?? {});
    if (res.ok) sent++;

    // Update engagement status + streak bookkeeping.
    const patch: Partial<User> = {
      missed_count: daysMissed,
      streak: daysMissed >= 1 ? 0 : u.streak,
      last_reminder_at: new Date().toISOString(),
    };
    if (daysMissed >= 7 && u.status !== "churned") {
      patch.status = "churned";
      newlyChurned++;
      await notifyAdmin(`🔴 Пользователь ушёл (7+ дней без фидбэка): ${describe(u)}`);
    } else if (daysMissed >= 3 && u.status === "active") {
      patch.status = "at_risk";
      newlyAtRisk++;
      await notifyAdmin(`🟡 Под риском (3+ дней без фидбэка): ${describe(u)}`);
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

async function notifyAdmin(text: string) {
  if (!ADMIN_CHAT_ID) return;
  await tg.sendMessage(ADMIN_CHAT_ID, text);
}
