import { supabase } from "@/integrations/supabase/client";

export interface PostData {
  id: string;
  content: string;
  post_type: string;
  job_role?: string;
  time_period?: string;
  salary?: number;
  bussiness_id?: string;
  user_id: string;
  upvotes: number;
  downvotes: number;
  created_at: string;
  updated_at: string;
  is_comment?: string;
}

export interface Post {
  id: string;
  author: string;
  text: string;
  businessId?: string;
  businessName?: string;
  images?: string[];
  isStory?: boolean;
  isJobUpdate?: boolean;
  linkedLocation?: string;
  upvotes: number;
  downvotes: number;
  userVote?: 'up' | 'down' | null;
  createdAt: Date;
  timestamp?: string;
  isComment?: string;
}

// Transform database post to frontend post format
export const transformPost = (dbPost: PostData, businesses: any[] = []): Post => {
  const business = businesses.find(b => b.id === dbPost.bussiness_id);
  
  return {
    id: dbPost.id,
    author: 'You', // For now, all posts are from current user
    text: dbPost.content,
    businessId: dbPost.bussiness_id,
    businessName: business?.name,
    isStory: dbPost.post_type === 'story',
    isJobUpdate: dbPost.post_type === 'job_update',
    linkedLocation: business?.name,
    upvotes: dbPost.upvotes,
    downvotes: dbPost.downvotes,
    userVote: null, // Will be determined by votes table
    createdAt: new Date(dbPost.created_at),
    timestamp: dbPost.created_at,
    isComment: dbPost.is_comment,
  };
};

// Get all posts
export const getPosts = async (): Promise<{ data: PostData[] | null; error: any }> => {
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .order('created_at', { ascending: false });

  return { data, error };
};

// Create a new post
export const createPost = async (
  content: string,
  postType: string,
  businessId?: string,
  jobRole?: string,
  timePeriod?: string,
  salary?: number,
  isComment?: string
): Promise<{ data: PostData | null; error: any }> => {
  // Generate a proper UUID format for temp user
  const tempUserId = crypto.randomUUID();
  
  const { data, error } = await supabase
    .from('posts')
    .insert({
      content,
      post_type: postType,
      user_id: tempUserId,
      bussiness_id: businessId,
      job_role: jobRole,
      time_period: timePeriod,
      salary,
      is_comment: isComment,
    })
    .select()
    .single();

  return { data, error };
};

// Vote on a post
export const voteOnPost = async (
  postId: string,
  voteType: 'upvote' | 'downvote'
): Promise<{ success: boolean; error?: any }> => {
  // Generate a proper UUID format for temp user
  const tempUserId = crypto.randomUUID();
  
  // Check if user already voted
  const { data: existingVote } = await supabase
    .from('votes')
    .select('*')
    .eq('post_id', postId)
    .eq('user_id', tempUserId)
    .single();

  if (existingVote) {
    if (existingVote.vote_type === voteType) {
      // Remove vote if same type
      const { error } = await supabase
        .from('votes')
        .delete()
        .eq('id', existingVote.id);
      
      return { success: !error, error };
    } else {
      // Update vote type
      const { error } = await supabase
        .from('votes')
        .update({ vote_type: voteType })
        .eq('id', existingVote.id);
      
      return { success: !error, error };
    }
  } else {
    // Create new vote
    const { error } = await supabase
      .from('votes')
      .insert({
        post_id: postId,
        user_id: tempUserId,
        vote_type: voteType
      });
    
    return { success: !error, error };
  }
};

// Get user's votes for posts
export const getUserVotes = async (postIds: string[]): Promise<{ [postId: string]: 'up' | 'down' }> => {
  if (postIds.length === 0) {
    return {};
  }

  // Generate a proper UUID format for temp user (for consistency, we'll use the same one per session)
  // Note: This won't work for tracking votes across sessions, but it's temporary until auth is implemented
  const tempUserId = crypto.randomUUID();
  
  const { data: votes } = await supabase
    .from('votes')
    .select('post_id, vote_type')
    .eq('user_id', tempUserId)
    .in('post_id', postIds);

  const userVotes: { [postId: string]: 'up' | 'down' } = {};
  votes?.forEach(vote => {
    userVotes[vote.post_id] = vote.vote_type === 'upvote' ? 'up' : 'down';
  });

  return userVotes;
};

// Delete a post
export const deletePost = async (postId: string): Promise<{ success: boolean; error?: any }> => {
  // First, get the current user
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return { success: false, error: 'User not authenticated' };
  }

  // Get the post to check ownership
  const { data: post, error: fetchError } = await supabase
    .from('posts')
    .select('user_id')
    .eq('id', postId)
    .single();

  if (fetchError) {
    return { success: false, error: fetchError };
  }

  // Check if user owns the post
  if (post.user_id !== user.id) {
    return { success: false, error: 'Not authorized to delete this post' };
  }

  // Delete the post
  const { error } = await supabase
    .from('posts')
    .delete()
    .eq('id', postId);

  return { success: !error, error };
};