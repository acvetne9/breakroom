/**
 * Voting persistence shared by posts and business roles.
 * One UPSERT (or DELETE when the vote is cleared) per click.
 */

import { supabase } from "@/integrations/supabase/client";
import { getDeviceId } from "@/utils/deviceId";

export type VoteTable = "votes" | "role_votes";
export type VoteItemField = "post_id" | "business_role_id";
export type DbVoteType = "upvote" | "downvote";

async function writeVote(tableName: VoteTable, itemId: string, voteType: DbVoteType | null) {
  const userId = getDeviceId();

  if (tableName === "votes") {
    if (voteType === null) {
      return supabase.from("votes").delete().eq("post_id", itemId).eq("user_id", userId);
    }
    return supabase
      .from("votes")
      .upsert({ post_id: itemId, user_id: userId, vote_type: voteType }, { onConflict: "user_id,post_id" });
  }

  if (voteType === null) {
    return supabase.from("role_votes").delete().eq("business_role_id", itemId).eq("user_id", userId);
  }
  return supabase
    .from("role_votes")
    .upsert({ business_role_id: itemId, user_id: userId, vote_type: voteType }, { onConflict: "user_id,business_role_id" });
}

export async function persistVote(
  tableName: VoteTable,
  _itemIdField: VoteItemField,
  itemId: string,
  voteType: DbVoteType | null,
): Promise<{ success: boolean; error?: unknown }> {
  if (!itemId || typeof itemId !== "string") {
    return { success: false, error: new Error("Invalid itemId") };
  }

  try {
    const { error } = await writeVote(tableName, itemId, voteType);
    if (error) return { success: false, error };
    return { success: true };
  } catch (error) {
    return { success: false, error };
  }
}
