/**
 * Generic optimistic voting hook
 * Provides instant UI feedback with background persistence
 */

import { useState, useCallback } from 'react';
import { calculateVoteChange } from '@/utils/voteCalculations';

export interface UseOptimisticVoteOptions {
  initialVotesTotal: number;
  initialUserVote: 'up' | 'down' | null;
  onPersist: (voteType: 'up' | 'down' | null) => Promise<boolean>;
  onError?: (error: string) => void;
}

export interface UseOptimisticVoteReturn {
  votesTotal: number;
  userVote: 'up' | 'down' | null;
  isVoting: boolean;
  handleVote: (voteType: 'up' | 'down') => void;
}

/**
 * Hook for managing optimistic vote updates
 * 
 * Usage:
 * ```tsx
 * const { votesTotal, userVote, isVoting, handleVote } = useOptimisticVote({
 *   initialVotesTotal: post.votesTotal,
 *   initialUserVote: post.userVote,
 *   onPersist: async (voteType) => {
 *     await persistVote('votes', 'post_id', post.id, voteType);
 *     return true;
 *   }
 * });
 * ```
 */
export function useOptimisticVote({
  initialVotesTotal,
  initialUserVote,
  onPersist,
  onError
}: UseOptimisticVoteOptions): UseOptimisticVoteReturn {
  const [votesTotal, setVotesTotal] = useState(initialVotesTotal);
  const [userVote, setUserVote] = useState<'up' | 'down' | null>(initialUserVote);
  const [isVoting, setIsVoting] = useState(false);

  const handleVote = useCallback(async (voteType: 'up' | 'down') => {
    // Calculate new state optimistically
    const { newUserVote, newTotal } = calculateVoteChange(
      userVote,
      voteType,
      votesTotal
    );

    // Store previous state for rollback
    const previousVotesTotal = votesTotal;
    const previousUserVote = userVote;

    // Update UI immediately
    setVotesTotal(newTotal);
    setUserVote(newUserVote);
    setIsVoting(true);

    try {
      // Persist in background - onPersist expects null or 'upvote'/'downvote'
      const success = await onPersist(newUserVote);

      if (!success) {
        // Rollback on error
        setVotesTotal(previousVotesTotal);
        setUserVote(previousUserVote);
        onError?.('Failed to save vote');
      }
    } catch (error) {
      // Rollback on exception
      setVotesTotal(previousVotesTotal);
      setUserVote(previousUserVote);
      onError?.(error instanceof Error ? error.message : 'Failed to save vote');
    } finally {
      setIsVoting(false);
    }
  }, [votesTotal, userVote, onPersist, onError]);

  return {
    votesTotal,
    userVote,
    isVoting,
    handleVote
  };
}
