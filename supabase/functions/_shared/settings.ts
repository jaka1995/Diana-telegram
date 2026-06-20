// Runtime settings shared by both bots, stored in the `settings` key/value table
// so the admin bot can change them without a redeploy.

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export interface BotSettings {
  reminder_enabled: boolean;
  reminder_hour: number; // 0–23 in BOT_TZ
  escalation_enabled: boolean;
}

export const DEFAULT_SETTINGS: BotSettings = {
  reminder_enabled: true,
  reminder_hour: 20,
  escalation_enabled: true,
};

export async function getSettings(db: SupabaseClient): Promise<BotSettings> {
  const { data } = await db.from("settings").select("key, value");
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const row of data ?? []) out[row.key] = row.value;
  return out as unknown as BotSettings;
}

export async function setSetting(
  db: SupabaseClient,
  key: keyof BotSettings,
  value: unknown,
): Promise<void> {
  await db
    .from("settings")
    .upsert({ key, value, updated_at: new Date().toISOString() });
}
