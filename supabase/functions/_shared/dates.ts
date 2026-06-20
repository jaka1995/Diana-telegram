// Helpers for working with "local" dates in the bot timezone.
// All day-based logic (streaks, "feedback today?") is computed in BOT_TZ
// so users in Kazakhstan get a sensible day boundary instead of UTC.

export const BOT_TZ = Deno.env.get("BOT_TZ") ?? "Asia/Almaty";

/** Returns the current date in BOT_TZ as an ISO string "YYYY-MM-DD". */
export function localDateStr(now: Date = new Date()): string {
  // en-CA locale formats as YYYY-MM-DD which is exactly what we want.
  return now.toLocaleDateString("en-CA", { timeZone: BOT_TZ });
}

/** Whole-day difference a - b for two "YYYY-MM-DD" strings. */
export function dayDiff(a: string, b: string): number {
  const da = Date.parse(a + "T00:00:00Z");
  const db = Date.parse(b + "T00:00:00Z");
  return Math.round((da - db) / 86_400_000);
}

/** Current hour (0–23) in BOT_TZ. */
export function localHour(now: Date = new Date()): number {
  const h = now.toLocaleString("en-US", {
    timeZone: BOT_TZ,
    hour: "2-digit",
    hour12: false,
  });
  // "24" can appear at midnight in some runtimes — normalize to 0.
  return Number(h) % 24;
}
