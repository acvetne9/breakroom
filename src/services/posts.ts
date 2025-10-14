import { supabase } from "@/integrations/supabase/client";

// Cache for user profile to avoid race conditions
let cachedProfileId: string | null = null;
let profilePromise: Promise<{ profileId: string; wasCreated: boolean }> | null = null;

// Global flag to ensure single initialization across the app
let isInitializing = false;

// Get user profile (fetch only, doesn't create)
export const getUserProfile = async (): Promise<{ profileId: string; wasCreated: boolean }> => {
  console.log('🔐 getUserProfile called - cached:', !!cachedProfileId);
  
  // Return cached profile if available
  if (cachedProfileId) {
    console.log('✅ Returning cached profile:', cachedProfileId);
    return { profileId: cachedProfileId, wasCreated: false };
  }
  
  // Return existing promise if one is in progress
  if (profilePromise) {
    console.log('⏳ Returning existing profile promise');
    return profilePromise;
  }
  
  // Create new promise for profile fetch
  profilePromise = (async () => {
    console.log('🚀 Fetching user profile');
    const { data: { user } } = await supabase.auth.getUser();
    
    if (user) {
      console.log('👤 Authenticated user detected:', user.id);
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (!profile) {
        throw new Error('Profile not found for authenticated user');
      }
      
      cachedProfileId = profile.id;
      console.log('💾 Cached profile ID:', cachedProfileId);
      return { profileId: profile.id, wasCreated: false };
    } else {
      console.log('👻 Unauthenticated user - using device ID');
      let deviceId = localStorage.getItem('device_id');
      
      if (!deviceId) {
        throw new Error('Device ID not found');
      }
      
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('temp_user_id', deviceId)
        .maybeSingle();
      
      if (!profile) {
        throw new Error('Profile not found for device');
      }
      
      cachedProfileId = profile.id;
      console.log('💾 Cached profile ID:', cachedProfileId);
      return { profileId: profile.id, wasCreated: false };
    }
  })();
  
  try {
    const result = await profilePromise;
    profilePromise = null;
    console.log('✅ getUserProfile completed:', result);
    return result;
  } catch (error) {
    profilePromise = null;
    cachedProfileId = null;
    console.error('❌ getUserProfile failed:', error);
    throw error;
  }
};

// Retrieve authenticated user ID or temporary ID for backwards compatibility
const getUserId = async (): Promise<string> => {
  const { profileId } = await getUserProfile();
  return profileId;
};

export interface PostData {
  id: string;
  content: string;
  post_type: string;
  job_role?: string;
  time_period?: string;
  salary?: number;
  business_id?: string;
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
  votesTotal: number;
  userVote?: 'up' | 'down' | null;
  createdAt: Date;
  timestamp?: string;
  isComment?: string;
  userId?: string;
}

// Transform database post to frontend post format
export const transformPost = async (dbPost: PostData, businesses: any[] = [], currentUserId?: string): Promise<Post> => {
  const business = businesses.find(b => b.id === dbPost.business_id);
  
  // Use provided currentUserId or get it once
  const userId = currentUserId || await getUserId();
  const isOwnPost = dbPost.user_id === userId;
  
  return {
    id: dbPost.id,
    author: isOwnPost ? 'You' : 'Other',
    text: dbPost.content,
    businessId: dbPost.business_id,
    businessName: business?.name,
    isStory: dbPost.post_type === 'story',
    isJobUpdate: dbPost.post_type === 'job_update',
    linkedLocation: business?.name,
    votesTotal: dbPost.upvotes - dbPost.downvotes,
    userVote: null, // Will be determined by votes table
    createdAt: new Date(dbPost.created_at),
    timestamp: dbPost.created_at,
    isComment: dbPost.is_comment,
    userId: dbPost.user_id,
  };
};

// Get all posts
export const getPosts = async (): Promise<{ data: PostData[] | null; error: any }> => {
  console.log('🔍 getPosts - fetching posts from database...');
  
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .order('created_at', { ascending: false });

  console.log('🔍 getPosts result:', {
    postCount: data?.length || 0,
    error: error?.message || 'none',
    firstPost: data?.[0] ? {
      id: data[0].id,
      content: data[0].content.substring(0, 50) + '...',
      user_id: data[0].user_id
    } : 'none'
  });

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
  // Get authenticated or temp user ID
  const userId = await getUserId();
  
  const { data, error } = await supabase
    .from('posts')
    .insert({
      content,
      post_type: postType,
      user_id: userId,
      business_id: businessId,
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
  // Get authenticated or temp user ID
  const userId = await getUserId();
  
  // Check if user already voted
  const { data: existingVote } = await supabase
    .from('votes')
    .select('*')
    .eq('post_id', postId)
    .eq('user_id', userId)
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
        user_id: userId,
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

  // Get authenticated or temp user ID
  const userId = await getUserId();
  
  const { data: votes } = await supabase
    .from('votes')
    .select('post_id, vote_type')
    .eq('user_id', userId)
    .in('post_id', postIds);

  const userVotes: { [postId: string]: 'up' | 'down' } = {};
  votes?.forEach(vote => {
    userVotes[vote.post_id] = vote.vote_type === 'upvote' ? 'up' : 'down';
  });

  return userVotes;
};

// Delete a post
export const deletePost = async (postId: string): Promise<{ success: boolean; error?: any }> => {
  // Get current user's profile ID
  const { profileId: currentProfileId } = await getUserProfile();
  
  // Get the post to check ownership
  const { data: post, error: fetchError } = await supabase
    .from('posts')
    .select('user_id')
    .eq('id', postId)
    .maybeSingle();

  if (fetchError) {
    return { success: false, error: fetchError };
  }

  if (!post) {
    return { success: false, error: 'Post not found' };
  }

  // Prevent deletion of default posts (system posts)
  if (post.user_id === '00000000-0000-0000-0000-000000000000') {
    return { success: false, error: 'Default posts cannot be deleted' };
  }

  // Check if user owns the post by comparing profile IDs
  if (post.user_id !== currentProfileId) {
    return { success: false, error: 'Not authorized to delete this post' };
  }

  // Delete the post (RLS will also enforce this)
  const { error } = await supabase
    .from('posts')
    .delete()
    .eq('id', postId);

  return { success: !error, error };
};