import { supabase } from "@/integrations/supabase/client";

// Cache for user profile to avoid race conditions
let cachedProfileId: string | null = null;
let profilePromise: Promise<{ profileId: string; wasCreated: boolean }> | null = null;

// Global flag to ensure single initialization across the app
let isInitializing = false;

// Get or create user profile in profiles table
export const getUserProfile = async (): Promise<{ profileId: string; wasCreated: boolean }> => {
  console.log('🔐 getUserProfile called - cached:', !!cachedProfileId, 'promise:', !!profilePromise, 'initializing:', isInitializing);
  
  // Return cached profile if available (always wasCreated: false for cached)
  if (cachedProfileId) {
    console.log('✅ Returning cached profile:', cachedProfileId);
    return { profileId: cachedProfileId, wasCreated: false };
  }
  
  // Return existing promise if one is in progress
  if (profilePromise) {
    console.log('⏳ Returning existing profile promise');
    return profilePromise;
  }
  
  // Check global initialization flag
  if (isInitializing) {
    console.log('⚠️ Another initialization in progress, waiting...');
    await new Promise(resolve => setTimeout(resolve, 100));
    return getUserProfile(); // Retry
  }
  
  // Set flag to prevent concurrent initializations
  isInitializing = true;
  
  // Create new promise for profile creation
  profilePromise = (async () => {
    console.log('🚀 Starting profile creation/fetch');
    const { data: { user } } = await supabase.auth.getUser();
    let wasCreated = false;
    
    if (user) {
      console.log('👤 Authenticated user detected:', user.id);
      // Authenticated user - find or create their profile
      let { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (!profile) {
        console.log('📝 Creating new authenticated profile');
        wasCreated = true;
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
          console.log('🔄 Profile conflict detected, fetching existing');
          // Profile already exists due to race condition, fetch it
          const { data: existingProfile } = await supabase
            .from('profiles')
            .select('id')
            .eq('user_id', user.id)
            .single();
          profile = existingProfile;
          wasCreated = false; // Not created by this call
        } else if (error) {
          throw error;
        } else {
          profile = newProfile;
        }
      } else {
        console.log('✅ Found existing authenticated profile:', profile.id);
      }
      
      // Set cache IMMEDIATELY to prevent race conditions
      cachedProfileId = profile!.id;
      console.log('💾 Cached profile ID:', cachedProfileId);
      return { profileId: profile!.id, wasCreated };
    } else {
      console.log('👻 Unauthenticated user - using device ID');
      // Unauthenticated user - use device_id for consistency
      let deviceId = localStorage.getItem('device_id');
      if (!deviceId) {
        console.log('🆔 Generating new device ID');
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
        
        // No random suffix - same device = same ID
        deviceId = `device_${fingerprint.substring(0, 40)}`;
        localStorage.setItem('device_id', deviceId);
        console.log('🆔 Created device ID:', deviceId);
      } else {
        console.log('🆔 Using existing device ID:', deviceId);
      }
      
      // Find existing temp profile using device_id
      let { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('temp_user_id', deviceId)
        .maybeSingle();
      
      if (!profile) {
        console.log('📝 Creating new temp profile');
        wasCreated = true;
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
          console.log('🔄 Temp profile conflict detected, fetching existing');
          // Profile already exists due to race condition, fetch it
          const { data: existingProfile } = await supabase
            .from('profiles')
            .select('id')
            .eq('temp_user_id', deviceId)
            .single();
          profile = existingProfile;
          wasCreated = false; // Not created by this call
        } else if (error) {
          throw error;
        } else {
          profile = newProfile;
        }
      } else {
        console.log('✅ Found existing temp profile:', profile.id);
      }
      
      // Set cache IMMEDIATELY to prevent race conditions
      cachedProfileId = profile!.id;
      console.log('💾 Cached profile ID:', cachedProfileId);
      return { profileId: profile!.id, wasCreated };
    }
  })();
  
  try {
    const result = await profilePromise;
    profilePromise = null; // Clear promise after completion
    isInitializing = false; // Clear flag
    console.log('✅ getUserProfile completed:', result);
    return result;
  } catch (error) {
    profilePromise = null; // Clear promise on error
    isInitializing = false; // Clear flag on error
    cachedProfileId = null; // Clear cache on error
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