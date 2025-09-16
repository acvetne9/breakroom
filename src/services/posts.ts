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
    createdAt: new Date(dbPost.created_at)
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
  salary?: number
): Promise<{ data: PostData | null; error: any }> => {
  // For now, use a temporary user ID since authentication isn't implemented
  const tempUserId = 'temp-user-' + Date.now();
  
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
  // For now, use a consistent temp user ID per session
  const tempUserId = 'temp-user-session';
  
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

  // Use consistent temp user ID to get votes
  const tempUserId = 'temp-user-session';
  
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
  // For now, allow deleting any post since authentication isn't implemented
  // TODO: Restrict to own posts when authentication is added
  const { error } = await supabase
    .from('posts')
    .delete()
    .eq('id', postId);

  return { success: !error, error };
};