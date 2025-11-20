import { supabase } from "@/integrations/supabase/client";

// Debug function to check profile status
export const debugProfileStatus = async () => {
  const deviceId = localStorage.getItem("device_id");
  console.log("🔍 Debug: device_id in localStorage:", deviceId);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  console.log("🔍 Debug: authenticated user:", user?.id);

  if (user) {
    const { data: profile } = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
    console.log("🔍 Debug: profile for auth user:", profile);
  } else if (deviceId) {
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", deviceId).maybeSingle();
    console.log("🔍 Debug: profile for device_id:", profile);
  }
};

// Cache for user profile to avoid race conditions
let cachedProfileId: string | null = null;
let profilePromise: Promise<{ profileId: string; wasCreated: boolean }> | null = null;

// Global flag to ensure single initialization across the app
let isInitializing = false;

// Clear cached profile data (useful when device context changes)
export const clearProfileCache = () => {
  console.log("🧹 Clearing profile cache");
  cachedProfileId = null;
  profilePromise = null;
};

export const getUserProfile = async (): Promise<{ profileId: string }> => {
  if (cachedProfileId) {
    return { profileId: cachedProfileId };
  }

  // Just get deviceId - that's the profile ID
  const deviceId = localStorage.getItem("device_id");

  if (!deviceId) {
    throw new Error("Device ID not found");
  }

  cachedProfileId = deviceId;
  return { profileId: deviceId };
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
  votes_total: number;
  created_at: string;
  is_comment?: string;
  is_deleted?: boolean;
}

export interface Post {
  id: string;
  author: string;
  text: string;
  businessId?: string;
  businessName?: string;
  businessLat?: number;
  businessLng?: number;
  images?: string[];
  isStory?: boolean;
  isJobUpdate?: boolean;
  linkedLocation?: string;
  votesTotal: number;
  userVote?: "up" | "down" | null;
  createdAt: Date;
  timestamp?: string;
  isComment?: string;
  userId?: string;
}

// Transform database post to frontend post format (no businesses array needed - data is flattened)
export const transformPost = async (
  dbPost: PostData,
  _businesses: any[] = [],
  currentUserId?: string,
): Promise<Post> => {
  // Use provided currentUserId or get it once
  const userId = currentUserId || (await getUserId());
  const isOwnPost = dbPost.user_id === userId;

  // Extract coordinates from flattened data (already joined in getPosts query)
  const businessLat = (dbPost as any).business_lat;
  const businessLng = (dbPost as any).business_lng;

  return {
    id: dbPost.id,
    author: isOwnPost ? "You" : "Other",
    text: dbPost.content,
    businessId: dbPost.business_id,
    businessName: (dbPost as any).business_name,
    businessLat,
    businessLng,
    isStory: dbPost.post_type === "story",
    isJobUpdate: dbPost.post_type === "job_update",
    linkedLocation: (dbPost as any).business_name,
    votesTotal: dbPost.votes_total || 0,
    userVote: null, // Will be determined by votes table
    createdAt: new Date(dbPost.created_at),
    timestamp: dbPost.created_at,
    isComment: dbPost.is_comment,
    userId: dbPost.user_id,
  };
};

// Get posts with pagination (excludes soft-deleted posts)
export const getPosts = async (
  limit: number = 1000,
  offset: number = 0,
): Promise<{ data: PostData[] | null; error: any }> => {
  console.log(`🔍 getPosts - fetching ${limit} posts with coordinates...`);

  const { data, error } = await supabase
    .from("posts")
    .select(
      `
      *,
      businesses(id, name, lat, lng)
    `,
    )
    .or('is_deleted.is.null,is_deleted.eq.false') // Exclude deleted posts
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  console.log("📊 RAW SUPABASE RESPONSE:", {
    dataLength: data?.length || 0,
    error,
    firstPost: data?.[0],
  });

  if (error) {
    console.error("❌ Error fetching posts:", error);
    return { data: null, error };
  }

  // Transform data to flatten business coordinates (handle null businesses from left join)
  const transformedData = data?.map((post: any) => ({
    ...post,
    business_lat: post.businesses?.lat || null,
    business_lng: post.businesses?.lng || null,
    business_name: post.businesses?.name || null,
  }));

  console.log(`✅ Fetched ${transformedData?.length || 0} posts with coordinates`);
  console.log("🔍 TRANSFORMED DATA SAMPLE:", {
    totalPosts: transformedData?.length,
    firstThreePosts: transformedData?.slice(0, 3).map((p) => ({
      id: p.id,
      text: p.content?.substring(0, 30),
      business_id: p.business_id,
      business_name: p.business_name,
      hasCoordinates: !!(p.business_lat && p.business_lng),
    })),
  });
  return { data: transformedData as PostData[], error: null };
};

// Create a new post
export const createPost = async (
  content: string,
  postType: string,
  businessId?: string,
  jobRole?: string,
  timePeriod?: string,
  salary?: number,
  isComment?: string,
): Promise<{ data: PostData | null; error: any }> => {
  // Get authenticated or temp user ID
  const userId = await getUserId();

  const { data, error } = await supabase
    .from("posts")
    .insert({
      content,
      post_type: postType,
      user_id: userId,
      business_id: businessId,
      job_role: jobRole,
      time_period: timePeriod,
      salary,
      is_comment: isComment,
      created_at: new Date().toISOString(), // Explicitly set timestamp
    })
    .select(
      `
      *,
      businesses(id, name, lat, lng)
    `,
    )
    .single();

  if (error) {
    return { data: null, error };
  }

  // Flatten business data like in getPosts
  const transformedData = {
    ...data,
    business_lat: data.businesses?.lat || null,
    business_lng: data.businesses?.lng || null,
    business_name: data.businesses?.name || null,
  };

  return { data: transformedData as PostData, error: null };
};

// Vote on a post
export const voteOnPost = async (
  postId: string,
  voteType: "upvote" | "downvote",
): Promise<{ success: boolean; error?: any }> => {
  // Get authenticated or temp user ID
  const userId = await getUserId();

  // Check if user already voted
  const { data: existingVote } = await supabase
    .from("votes")
    .select("*")
    .eq("post_id", postId)
    .eq("user_id", userId)
    .single();

  if (existingVote) {
    if (existingVote.vote_type === voteType) {
      // Remove vote if same type
      const { error } = await supabase.from("votes").delete().eq("id", existingVote.id);

      return { success: !error, error };
    } else {
      // Update vote type
      const { error } = await supabase.from("votes").update({ vote_type: voteType }).eq("id", existingVote.id);

      return { success: !error, error };
    }
  } else {
    // Create new vote
    const { error } = await supabase.from("votes").insert({
      post_id: postId,
      user_id: userId,
      vote_type: voteType,
    });

    return { success: !error, error };
  }
};

// Get user's votes for posts
export const getUserVotes = async (postIds: string[]): Promise<{ [postId: string]: "up" | "down" }> => {
  if (postIds.length === 0) {
    return {};
  }

  // Get device ID directly
  const deviceId = localStorage.getItem("device_id");
  
  if (!deviceId) {
    console.warn("No device ID found, cannot fetch user votes");
    return {};
  }

  console.log("🔍 Fetching votes for user:", deviceId, "for", postIds.length, "posts");

  try {
    // Batch requests in chunks of 100 to avoid URL length limits
    const BATCH_SIZE = 100;
    const allVotes: { [postId: string]: "up" | "down" } = {};

    for (let i = 0; i < postIds.length; i += BATCH_SIZE) {
      const batch = postIds.slice(i, i + BATCH_SIZE);
      
      const { data: votes, error } = await supabase
        .from("votes")
        .select("post_id, vote_type")
        .eq("user_id", deviceId)
        .in("post_id", batch);

      if (error) {
        console.error("❌ Error fetching user votes batch:", error);
        continue; // Skip this batch but continue with others
      }

      if (votes) {
        votes.forEach((vote) => {
          allVotes[vote.post_id] = vote.vote_type === "upvote" ? "up" : "down";
        });
      }
    }

    console.log("✅ Fetched user votes:", Object.keys(allVotes).length, "votes");
    return allVotes;
  } catch (error) {
    console.error("❌ Exception fetching user votes:", error);
    return {};
  }
};

// Soft delete a post (marks as deleted)
export const deletePost = async (postId: string): Promise<{ success: boolean; error?: any }> => {
  // Get current user's profile ID
  const { profileId: currentProfileId } = await getUserProfile();

  // Get the post to check ownership
  const { data: post, error: fetchError } = await supabase
    .from("posts")
    .select("user_id, is_deleted")
    .eq("id", postId)
    .maybeSingle();

  if (fetchError) {
    return { success: false, error: fetchError };
  }

  if (!post) {
    return { success: false, error: "Post not found" };
  }

  // Prevent deletion of default posts (system posts)
  if (post.user_id === "00000000-0000-0000-0000-000000000000") {
    return { success: false, error: "Default posts cannot be deleted" };
  }

  // Check if user owns the post by comparing profile IDs
  if (post.user_id !== currentProfileId) {
    return { success: false, error: "Not authorized to delete this post" };
  }

  // Soft delete: mark as deleted
  const { error } = await supabase
    .from("posts")
    .update({ is_deleted: true })
    .eq("id", postId);

  return { success: !error, error };
};

// Hard delete a post (permanently removes from database)
export const hardDeletePost = async (postId: string): Promise<{ success: boolean; error?: any }> => {
  // Get current user's profile ID
  const { profileId: currentProfileId } = await getUserProfile();

  // Get the post to check ownership
  const { data: post, error: fetchError } = await supabase
    .from("posts")
    .select("user_id")
    .eq("id", postId)
    .maybeSingle();

  if (fetchError) {
    return { success: false, error: fetchError };
  }

  if (!post) {
    return { success: false, error: "Post not found" };
  }

  // Prevent deletion of default posts (system posts)
  if (post.user_id === "00000000-0000-0000-0000-000000000000") {
    return { success: false, error: "Default posts cannot be deleted" };
  }

  // Check if user owns the post by comparing profile IDs
  if (post.user_id !== currentProfileId) {
    return { success: false, error: "Not authorized to delete this post" };
  }

  // Hard delete: permanently remove from database
  const { error } = await supabase.from("posts").delete().eq("id", postId);

  return { success: !error, error };
};
