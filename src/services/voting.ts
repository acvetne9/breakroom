/**
 * Unified voting service for both posts and business roles
 * Uses efficient UPSERT operations to minimize database queries
 */

import { supabase } from '@/integrations/supabase/client';
import { getUserProfile } from './posts';

export type VoteTable = 'votes' | 'role_votes';
export type VoteItemField = 'post_id' | 'business_role_id';

/**
 * Persist a vote to the database using UPSERT
 * - If voteType is null, removes the vote
 * - Otherwise, inserts or updates the vote
 * 
 * This uses a single query instead of 3-4 separate queries
 */
export async function persistVote(
  tableName: VoteTable,
  itemIdField: VoteItemField,
  itemId: string,
  voteType: 'upvote' | 'downvote' | null
): Promise<{ success: boolean; error?: any }> {
  try {
    const { profileId: userId } = await getUserProfile();

    if (voteType === null) {
      // Remove vote
      const { error } = await supabase
        .from(tableName)
        .delete()
        .eq(itemIdField, itemId)
        .eq('user_id', userId);

      if (error) {
        console.error(`❌ Error removing vote from ${tableName}:`, error);
        return { success: false, error };
      }
    } else {
      // Upsert vote (insert or update)
      const voteData = {
        [itemIdField]: itemId,
        user_id: userId,
        vote_type: voteType
      };

      const { error } = await supabase
        .from(tableName)
        .upsert(voteData, {
          onConflict: `user_id,${itemIdField}`
        });

      if (error) {
        console.error(`❌ Error upserting vote in ${tableName}:`, error);
        return { success: false, error };
      }
    }

    return { success: true };
  } catch (error) {
    console.error(`❌ Exception in persistVote:`, error);
    return { success: false, error };
  }
}
