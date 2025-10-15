/**
 * Pure functions for calculating vote state changes
 * Used for optimistic UI updates across posts and roles
 */

export interface VoteChangeResult {
  newUserVote: 'up' | 'down' | null;
  newTotal: number;
  delta: number;
  action: 'add' | 'remove' | 'switch';
}

/**
 * Calculate the new vote state when a user clicks a vote button
 * 
 * Logic:
 * - Clicking the same vote → remove it (toggle off)
 * - Clicking opposite vote → switch (±2 total change)
 * - Clicking with no vote → add it (±1 total change)
 */
export function calculateVoteChange(
  currentUserVote: 'up' | 'down' | null,
  newVoteType: 'up' | 'down',
  currentTotal: number
): VoteChangeResult {
  let newUserVote: 'up' | 'down' | null;
  let delta: number;
  let action: 'add' | 'remove' | 'switch';

  if (newVoteType === 'up') {
    if (currentUserVote === 'up') {
      // Remove upvote
      newUserVote = null;
      delta = -1;
      action = 'remove';
    } else if (currentUserVote === 'down') {
      // Switch from downvote to upvote
      newUserVote = 'up';
      delta = 2;
      action = 'switch';
    } else {
      // Add upvote
      newUserVote = 'up';
      delta = 1;
      action = 'add';
    }
  } else {
    // newVoteType === 'down'
    if (currentUserVote === 'down') {
      // Remove downvote
      newUserVote = null;
      delta = 1;
      action = 'remove';
    } else if (currentUserVote === 'up') {
      // Switch from upvote to downvote
      newUserVote = 'down';
      delta = -2;
      action = 'switch';
    } else {
      // Add downvote
      newUserVote = 'down';
      delta = -1;
      action = 'add';
    }
  }

  return {
    newUserVote,
    newTotal: currentTotal + delta,
    delta,
    action
  };
}
