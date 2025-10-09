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
        } else {
          // Different vote - update it
          const { error: updateError } = await supabase
            .from('role_votes')
            .update({ vote_type: dbVoteType })
            .eq('id', existingVote.id);

          if (updateError) throw updateError;
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
      }
    } else {
      // Anonymous voting not supported for database persistence
      // The trigger will automatically calculate votes_total from role_votes table
      return { 
        success: false, 
        error: 'Anonymous voting requires authentication' 
      };
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
