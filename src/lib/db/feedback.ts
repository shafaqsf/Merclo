/**
 * Data access for `public.message_feedback` (thumbs up/down / CSAT).
 * Writes use the admin client (called from the public feedback endpoint).
 * Reads for analytics are owner-scoped via RLS elsewhere.
 */
import { createAdminSupabase } from "@/lib/supabase/admin";

export type Rating = "up" | "down";

/**
 * Upsert a rating for a specific assistant message in a conversation. Re-rating
 * the same message overwrites the previous value (unique on
 * conversation_id + message_index).
 */
export async function recordFeedback(input: {
  conversationId: string;
  messageIndex: number;
  rating: Rating;
}): Promise<void> {
  const supabase = createAdminSupabase();
  const { error } = await supabase
    .from("message_feedback")
    .upsert(
      {
        conversation_id: input.conversationId,
        message_index: input.messageIndex,
        rating: input.rating,
      },
      { onConflict: "conversation_id,message_index" }
    );
  if (error) throw new Error(`Failed to record feedback: ${error.message}`);
}
