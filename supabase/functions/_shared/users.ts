// Data-access helpers for the `users` and `feedback` tables.

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { dayDiff, localDateStr } from "./dates.ts";

export interface User {
  id: number;
  chat_id: number;
  username: string | null;
  first_name: string | null;
  email: string | null;
  state: string;
  promo_issued: boolean;
  platform: string | null;
  status: string;
  reminder_enabled: boolean;
  streak: number;
  longest_streak: number;
  total_feedback: number;
  missed_count: number;
  last_feedback_at: string | null;
  last_feedback_date: string | null;
  onboarded_at: string | null;
}

/** Find a user or create a bare record on first contact. */
export async function getOrCreateUser(
  db: SupabaseClient,
  from: { id: number; username?: string; first_name?: string },
  chatId: number,
): Promise<User> {
  const { data: existing } = await db
    .from("users")
    .select("*")
    .eq("id", from.id)
    .maybeSingle();

  if (existing) return existing as User;

  const { data, error } = await db
    .from("users")
    .insert({
      id: from.id,
      chat_id: chatId,
      username: from.username ?? null,
      first_name: from.first_name ?? null,
      state: "new",
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as User;
}

export async function updateUser(
  db: SupabaseClient,
  id: number,
  patch: Partial<User>,
): Promise<void> {
  const { error } = await db
    .from("users")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/**
 * Records a feedback message and recomputes the streak.
 * Returns the new streak and whether it was the first feedback today.
 */
export async function recordFeedback(
  db: SupabaseClient,
  user: User,
  text: string,
): Promise<{ streak: number; firstToday: boolean }> {
  const today = localDateStr();

  // Always store the raw message.
  await db.from("feedback").insert({
    user_id: user.id,
    feedback_date: today,
    text,
  });

  if (user.last_feedback_date === today) {
    // Already counted today — keep streak, just store the extra message.
    return { streak: user.streak, firstToday: false };
  }

  let streak = 1;
  if (user.last_feedback_date) {
    streak = dayDiff(today, user.last_feedback_date) === 1
      ? user.streak + 1
      : 1;
  }

  await updateUser(db, user.id, {
    streak,
    longest_streak: Math.max(user.longest_streak, streak),
    total_feedback: user.total_feedback + 1,
    missed_count: 0,
    status: "active",
    last_feedback_at: new Date().toISOString(),
    last_feedback_date: today,
  });

  return { streak, firstToday: true };
}
