/**
 * Optimistic voting primitives
 * Provides instant UI feedback with background persistence.
 *
 * Two exports:
 * - `applyOptimisticVote`: a flexible, state-shape-agnostic core that computes
 *   the next vote state via `calculateVoteChange`, applies it optimistically,
 *   persists, and rolls back on failure. Callers own their own state.
 * - `useOptimisticVote`: a convenience hook built on the primitive for the
 *   simple "single item owns its own votesTotal/userVote" case.
 */

import { useState, useCallback } from 'react';
import { calculateVoteChange } from '@/utils/voteCalculations';

/**
 * Shape of the values produced by `calculateVoteChange` that callers apply.
 */
export interface OptimisticVoteState {
  newUserVote: 'up' | 'down' | null;
  newTotal: number;
}

export interface ApplyOptimisticVoteParams {
  /** The current userVote for the item being voted on. */
  currentUserVote: 'up' | 'down' | null;
  /** The current vote total for the item being voted on. */
  currentVotesTotal: number;
  /** The direction the user clicked. */
  voteType: 'up' | 'down';
  /**
   * Apply the optimistic (or rolled-back) values to caller-owned state.
   * Called once immediately with the new values, and again with the previous
   * values if persistence fails.
   */
  apply: (state: OptimisticVoteState) => void;
  /**
   * Persist the resulting vote. Receives the new userVote already computed.
   * Should resolve `true`/`{ success: true }`-equivalent on success, and either
   * resolve falsy or reject on failure. The primitive treats a rejected promise
   * or a falsy return as a failure and triggers rollback.
   */
  persist: (newUserVote: 'up' | 'down' | null) => Promise<boolean>;
  /** Optional callback invoked when persistence fails (after rollback). */
  onError?: (error: unknown) => void;
}

/**
 * Core optimistic-vote routine shared by posts and business roles.
 *
 * Behavior (identical to the previously hand-written implementations):
 * 1. Compute { newUserVote, newTotal } via `calculateVoteChange`.
 * 2. Capture the previous userVote/total for rollback.
 * 3. `apply` the new values immediately (optimistic UI).
 * 4. `persist` in the background.
 * 5. On failure (falsy return or thrown/rejected), `apply` the previous values
 *    (rollback) and invoke `onError`.
 */
export async function applyOptimisticVote({
  currentUserVote,
  currentVotesTotal,
  voteType,
  apply,
  persist,
  onError,
}: ApplyOptimisticVoteParams): Promise<boolean> {
  const { newUserVote, newTotal } = calculateVoteChange(
    currentUserVote,
    voteType,
    currentVotesTotal,
  );

  // Capture previous state for rollback.
  const previousUserVote = currentUserVote;
  const previousVotesTotal = currentVotesTotal;

  // Optimistic update.
  apply({ newUserVote, newTotal });

  try {
    const success = await persist(newUserVote);
    if (!success) {
      apply({ newUserVote: previousUserVote, newTotal: previousVotesTotal });
      onError?.(new Error('Failed to save vote'));
      return false;
    }
    return true;
  } catch (error) {
    apply({ newUserVote: previousUserVote, newTotal: previousVotesTotal });
    onError?.(error);
    return false;
  }
}

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
 * Hook for managing optimistic vote updates on a single self-owned item.
 * Built on top of `applyOptimisticVote`.
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
  onError,
}: UseOptimisticVoteOptions): UseOptimisticVoteReturn {
  const [votesTotal, setVotesTotal] = useState(initialVotesTotal);
  const [userVote, setUserVote] = useState<'up' | 'down' | null>(initialUserVote);
  const [isVoting, setIsVoting] = useState(false);

  const handleVote = useCallback(
    async (voteType: 'up' | 'down') => {
      setIsVoting(true);
      try {
        await applyOptimisticVote({
          currentUserVote: userVote,
          currentVotesTotal: votesTotal,
          voteType,
          apply: ({ newUserVote, newTotal }) => {
            setVotesTotal(newTotal);
            setUserVote(newUserVote);
          },
          persist: onPersist,
          onError: (error) =>
            onError?.(error instanceof Error ? error.message : 'Failed to save vote'),
        });
      } finally {
        setIsVoting(false);
      }
    },
    [votesTotal, userVote, onPersist, onError],
  );

  return {
    votesTotal,
    userVote,
    isVoting,
    handleVote,
  };
}
