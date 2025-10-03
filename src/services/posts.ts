import { supabase } from "@/integrations/supabase/client";

// Cache for user profile to avoid race conditions
let cachedProfileId: string | null = null;
let profilePromise: Promise<string> | null = null;

// Get or create user profile in profiles table
export const getUserProfile = async (): Promise<string> => {
  // Return cached profile if available
  if (cachedProfileId) {
    return cachedProfileId;
  }
  
  // Return existing promise if one is in progress
  if (profilePromise) {
    return profilePromise;
  }
  
  // Create new promise for profile creation
  profilePromise = (async () => {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (user) {
      // Authenticated user - find or create their profile
      let { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (!profile) {
        // Try to create profile, handle conflicts gracefully
        const { data: newProfile, error } = await supabase
          .from('profiles')
          .insert({
            user_id: user.id,
            display_name: user.email?.split('@')[0] || 'User',
            is_authenticated: true
          })
          .select('id')
          .single();
        
        if (error && error.code === '23505') {
          // Profile already exists due to race condition, fetch it
          const { data: existingProfile } = await supabase
            .from('profiles')
            .select('id')
            .eq('user_id', user.id)
            .single();
          profile = existingProfile;
        } else if (error) {
          throw error;
        } else {
          profile = newProfile;
        }
      }
      
      cachedProfileId = profile!.id;
      return profile!.id;
    } else {
      // Unauthenticated user - use device_id for consistency
      let deviceId = localStorage.getItem('device_id');
      if (!deviceId) {
        // Generate device ID if not exists (same logic as DeviceContext)
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx?.fillText('device-fingerprint', 2, 2);
        const canvasFingerprint = canvas.toDataURL();
        
        const screen = `${window.screen.width}x${window.screen.height}`;
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const language = navigator.language;
        const userAgent = navigator.userAgent;
        
        const fingerprint = btoa(`${canvasFingerprint}-${screen}-${timezone}-${language}-${userAgent}`);
        const randomSuffix = Math.random().toString(36).substring(2, 15);
        
        deviceId = `device_${fingerprint.substring(0, 20)}_${randomSuffix}`;
        localStorage.setItem('device_id', deviceId);
      }
      
      // Find existing temp profile using device_id
      let { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('temp_user_id', deviceId)
        .maybeSingle();
      
      if (!profile) {
        // Try to create profile, handle conflicts gracefully
        const { data: newProfile, error } = await supabase
          .from('profiles')
          .insert({
            user_id: null,
            temp_user_id: deviceId,
            display_name: 'Anonymous User',
            is_authenticated: false
          })
          .select('id')
          .single();
        
        if (error && error.code === '23505') {
          // Profile already exists due to race condition, fetch it
          const { data: existingProfile } = await supabase
            .from('profiles')
            .select('id')
            .eq('temp_user_id', deviceId)
            .single();
          profile = existingProfile;
        } else if (error) {
          throw error;
        } else {
          profile = newProfile;
        }
      }
      
      cachedProfileId = profile!.id;
      return profile!.id;
    }
  })();
  
  try {
    const result = await profilePromise;
    profilePromise = null; // Clear promise after completion
    return result;
  } catch (error) {
    profilePromise = null; // Clear promise on error
    throw error;
  }
};

// Retrieve authenticated user ID or temporary ID for backwards compatibility
const getUserId = async (): Promise<string> => {
  return getUserProfile();
};

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
  userId?: string;
}

// Transform database post to frontend post format
export const transformPost = async (dbPost: PostData, businesses: any[] = [], currentUserId?: string): Promise<Post> => {
  const business = businesses.find(b => b.id === dbPost.bussiness_id);
  
  // Use provided currentUserId or get it once
  const userId = currentUserId || await getUserId();
  const isOwnPost = dbPost.user_id === userId;
  
  return {
    id: dbPost.id,
    author: isOwnPost ? 'You' : 'Other',
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
  const currentProfileId = await getUserProfile();
  
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