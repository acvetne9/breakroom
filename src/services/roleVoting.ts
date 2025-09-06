import { supabase } from '@/integrations/supabase/client';

export interface RoleVoteResult {
  success: boolean;
  error?: string;
}

export const handleRoleVote = async (
  businessId: string,
  roleId: string,
  voteType: 'up' | 'down'
): Promise<RoleVoteResult> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;

    // For authenticated users, check for existing votes to prevent duplicates
    if (userId) {
      const { data: existingVote, error: fetchError } = await supabase
        .from('role_votes')
        .select('*')
        .eq('business_role_id', roleId)
        .eq('user_id', userId)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        throw fetchError;
      }

      const dbVoteType = voteType === 'up' ? 'upvote' : 'downvote';

      if (existingVote) {
        if (existingVote.vote_type === dbVoteType) {
          // Same vote - remove it (toggle off)
          const { error: deleteError } = await supabase
            .from('role_votes')
            .delete()
            .eq('id', existingVote.id);

          if (deleteError) throw deleteError;

          // Update business_roles vote counts
          const { error: updateError } = await supabase
            .from('business_roles')
            .update({
              [voteType === 'up' ? 'upvotes' : 'downvotes']: 
                Math.max(0, (existingVote.vote_type === 'upvote' ? 
                  (await getCurrentVoteCount(roleId, 'upvotes')) - 1 :
                  (await getCurrentVoteCount(roleId, 'downvotes')) - 1))
            })
            .eq('id', roleId);

          if (updateError) throw updateError;
        } else {
          // Different vote - update it
          const { error: updateError } = await supabase
            .from('role_votes')
            .update({ vote_type: dbVoteType })
            .eq('id', existingVote.id);

          if (updateError) throw updateError;

          // Update business_roles vote counts (subtract old, add new)
          const currentUpvotes = await getCurrentVoteCount(roleId, 'upvotes');
          const currentDownvotes = await getCurrentVoteCount(roleId, 'downvotes');

          const { error: updateRoleError } = await supabase
            .from('business_roles')
            .update({
              upvotes: voteType === 'up' ? currentUpvotes + 1 : Math.max(0, currentUpvotes - 1),
              downvotes: voteType === 'down' ? currentDownvotes + 1 : Math.max(0, currentDownvotes - 1)
            })
            .eq('id', roleId);

          if (updateRoleError) throw updateRoleError;
        }
      } else {
        // New authenticated vote - create it
        const { error: insertError } = await supabase
          .from('role_votes')
          .insert({
            business_role_id: roleId,
            user_id: userId,
            vote_type: dbVoteType
          });

        if (insertError) throw insertError;

        // Update business_roles vote counts
        const currentCount = await getCurrentVoteCount(roleId, voteType === 'up' ? 'upvotes' : 'downvotes');
        const { error: updateError } = await supabase
          .from('business_roles')
          .update({
            [voteType === 'up' ? 'upvotes' : 'downvotes']: currentCount + 1
          })
          .eq('id', roleId);

        if (updateError) throw updateError;
      }
    } else {
      // Anonymous voting - just update the vote counts directly
      const currentCount = await getCurrentVoteCount(roleId, voteType === 'up' ? 'upvotes' : 'downvotes');
      const { error: updateError } = await supabase
        .from('business_roles')
        .update({
          [voteType === 'up' ? 'upvotes' : 'downvotes']: currentCount + 1
        })
        .eq('id', roleId);

      if (updateError) throw updateError;
    }

    return { success: true };
  } catch (error) {
    console.error('Role voting error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    };
  }
};

async function getCurrentVoteCount(roleId: string, field: 'upvotes' | 'downvotes'): Promise<number> {
  const { data, error } = await supabase
    .from('business_roles')
    .select(field)
    .eq('id', roleId)
    .single();

  if (error) throw error;
  return data?.[field] || 0;
}