import { supabase } from "@/integrations/supabase/client";
import { retryWithBackoff, isRetryableError } from "@/utils/retryWithBackoff";
import { getDeviceId } from "@/utils/deviceId";

/** The profile row for the system-authored seed posts. Never deletable. */
export const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

/** The current user's profile id is the device id. */
export const getUserProfile = async (): Promise<{ profileId: string }> => ({ profileId: getDeviceId() });

/** Raw `posts` row plus the flattened business join. */
export interface PostData {
  id: string;
  content: string;
  post_type: string;
  job_role?: string | null;
  time_period?: string | null;
  salary?: number | null;
  business_id?: string | null;
  user_id: string;
  votes_total: number;
  created_at: string;
  /** When set, this row is a comment on the post with that id. */
  is_comment?: string | null;
  is_deleted?: boolean;
  business_name?: string | null;
  business_lat?: number | null;
  business_lng?: number | null;
}

/** Post shape used by the UI. Single source of truth for every component. */
export interface Post {
  id: string;
  author: "You" | "Other" | "System";
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
  /** Parent post id when this post is a comment. */
  isComment?: string;
  userId?: string;
}

const POST_SELECT = `
  id,
  content,
  post_type,
  business_id,
  user_id,
  votes_total,
  created_at,
  is_comment,
  is_deleted,
  businesses(id, name, lat, lng)
`;

type RawPostRow = Omit<PostData, "business_name" | "business_lat" | "business_lng"> & {
  businesses?: { id: string; name: string; lat: number; lng: number } | null;
};

const flattenBusiness = (row: RawPostRow): PostData => {
  const { businesses, ...rest } = row;
  return {
    ...rest,
    business_lat: businesses?.lat ?? null,
    business_lng: businesses?.lng ?? null,
    business_name: businesses?.name ?? null,
  };
};

export const transformPost = (dbPost: PostData, currentUserId: string = getDeviceId()): Post => ({
  id: dbPost.id,
  author: dbPost.user_id === SYSTEM_USER_ID ? "System" : dbPost.user_id === currentUserId ? "You" : "Other",
  text: dbPost.content,
  businessId: dbPost.business_id ?? undefined,
  businessName: dbPost.business_name ?? undefined,
  businessLat: dbPost.business_lat ?? undefined,
  businessLng: dbPost.business_lng ?? undefined,
  isStory: dbPost.post_type === "story",
  isJobUpdate: dbPost.post_type === "job_update",
  linkedLocation: dbPost.business_name ?? undefined,
  votesTotal: dbPost.votes_total || 0,
  userVote: null,
  createdAt: new Date(dbPost.created_at),
  timestamp: dbPost.created_at,
  isComment: dbPost.is_comment ?? undefined,
  userId: dbPost.user_id,
});

/**
 * One page of top-level posts (comments excluded), newest first.
 * Comments are loaded separately with `getCommentsForPosts` so a post's thread
 * is complete regardless of how old the comments are.
 */
export const getPosts = async (
  limit: number,
  offset: number = 0,
): Promise<{ data: PostData[] | null; error: unknown }> => {
  const { data, error } = await retryWithBackoff(
    () =>
      supabase
        .from("posts")
        .select(POST_SELECT)
        .eq("is_deleted", false)
        .is("is_comment", null)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1),
    { shouldRetry: isRetryableError },
  );

  if (error) return { data: null, error };
  return { data: (data as unknown as RawPostRow[]).map(flattenBusiness), error: null };
};

/** All non-deleted comments whose parent is one of `postIds`. */
export const getCommentsForPosts = async (postIds: string[]): Promise<PostData[]> => {
  if (postIds.length === 0) return [];

  const BATCH = 100;
  const out: PostData[] = [];
  for (let i = 0; i < postIds.length; i += BATCH) {
    const { data, error } = await supabase
      .from("posts")
      .select(POST_SELECT)
      .eq("is_deleted", false)
      .in("is_comment", postIds.slice(i, i + BATCH))
      .order("created_at", { ascending: true });
    if (error) {
      console.error("Error fetching comments:", error);
      continue;
    }
    out.push(...(data as unknown as RawPostRow[]).map(flattenBusiness));
  }
  return out;
};

/** A single post by id (used when a realtime insert arrives). */
export const getPostById = async (postId: string): Promise<PostData | null> => {
  const { data, error } = await supabase.from("posts").select(POST_SELECT).eq("id", postId).maybeSingle();
  if (error || !data) return null;
  return flattenBusiness(data as unknown as RawPostRow);
};

export const createPost = async (
  content: string,
  postType: string,
  businessId?: string,
  jobRole?: string,
  timePeriod?: string,
  salary?: number,
  isComment?: string,
): Promise<{ data: PostData | null; error: unknown }> => {
  const { data, error } = await supabase
    .from("posts")
    .insert({
      content,
      post_type: postType,
      user_id: getDeviceId(),
      business_id: businessId,
      job_role: jobRole,
      time_period: timePeriod,
      salary,
      is_comment: isComment,
    })
    .select(POST_SELECT)
    .single();

  if (error) return { data: null, error };
  return { data: flattenBusiness(data as unknown as RawPostRow), error: null };
};

/** The current device's votes for the given posts. */
export const getUserVotes = async (postIds: string[]): Promise<{ [postId: string]: "up" | "down" }> => {
  if (postIds.length === 0) return {};

  const BATCH = 100;
  const allVotes: { [postId: string]: "up" | "down" } = {};

  for (let i = 0; i < postIds.length; i += BATCH) {
    const { data, error } = await supabase
      .from("votes")
      .select("post_id, vote_type")
      .eq("user_id", getDeviceId())
      .in("post_id", postIds.slice(i, i + BATCH));

    if (error) {
      console.error("Error fetching user votes:", error);
      continue;
    }
    for (const vote of data ?? []) {
      allVotes[vote.post_id] = vote.vote_type === "upvote" ? "up" : "down";
    }
  }
  return allVotes;
};

/**
 * Soft delete. Row-level security only lets the author's device update the
 * row; the local check just gives a clearer message than a silent no-op.
 */
export const deletePost = async (postId: string): Promise<{ success: boolean; error?: unknown }> => {
  const { data: post, error: fetchError } = await supabase
    .from("posts")
    .select("user_id")
    .eq("id", postId)
    .maybeSingle();

  if (fetchError) return { success: false, error: fetchError };
  if (!post) return { success: false, error: "Post not found" };
  if (post.user_id === SYSTEM_USER_ID) return { success: false, error: "Default posts cannot be deleted" };
  if (post.user_id !== getDeviceId()) return { success: false, error: "Not authorized to delete this post" };

  const { error } = await supabase.from("posts").update({ is_deleted: true }).eq("id", postId);
  return { success: !error, error };
};
