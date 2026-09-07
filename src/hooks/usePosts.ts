import { useState, useEffect, useCallback, useRef } from "react";
import {
  getPosts,
  getCommentsForPosts,
  getPostById,
  createPost,
  deletePost,
  getUserVotes,
  transformPost,
  Post,
  PostData,
} from "@/services/posts";
import { supabase } from "@/integrations/supabase/client";
import { useSessionCache } from "./useSessionCache";
import { useReconnectionHandler } from "./useReconnectionHandler";
import { applyOptimisticVote } from "./useOptimisticVote";
import { persistVote } from "@/services/voting";

const POSTS_PER_PAGE = 30;

/**
 * Feed state: top-level posts and their comments live in one array so filters
 * can slice it either way. Comments are fetched for every loaded page, so a
 * thread is always complete once its parent post is on screen.
 */
export const usePosts = () => {
  const { cachedData: initialCachedPosts, saveToCache } = useSessionCache<Post[]>({
    key: "posts_cache",
    version: "2.0",
    deserialize: (data: Array<Post & { createdAt: string }>) =>
      data.map((p) => ({ ...p, createdAt: new Date(p.createdAt) })),
  });

  const [posts, setPosts] = useState<Post[]>(initialCachedPosts || []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  // Refs so the fetcher and the realtime handler never read stale state.
  const offsetRef = useRef(0);
  const loadingRef = useRef(false);
  const postsRef = useRef<Post[]>(posts);
  postsRef.current = posts;

  const commitPosts = useCallback(
    (updater: (prev: Post[]) => Post[]) => {
      setPosts((prev) => {
        const next = updater(prev);
        saveToCache(next);
        return next;
      });
    },
    [saveToCache],
  );

  /** Fetch a page of posts plus their comments and the device's votes on all of them. */
  const fetchPage = useCallback(async (offset: number): Promise<Post[] | null> => {
    const { data: postsData, error: postsError } = await getPosts(POSTS_PER_PAGE, offset);
    if (postsError || !postsData) {
      console.error("Posts fetch error:", postsError);
      return null;
    }

    setHasMore(postsData.length === POSTS_PER_PAGE);

    const comments = await getCommentsForPosts(postsData.map((p) => p.id));
    const rows: PostData[] = [...postsData, ...comments];
    const transformed = rows.map((row) => transformPost(row));
    const userVotes = await getUserVotes(transformed.map((p) => p.id));

    return transformed.map((post) => ({ ...post, userVote: userVotes[post.id] || null }));
  }, []);

  const fetchPosts = useCallback(
    async (isLoadMore = false) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      setLoading(true);
      setError(null);

      try {
        const offset = isLoadMore ? offsetRef.current : 0;
        const page = await fetchPage(offset);
        if (!page) {
          setError("Failed to fetch posts");
          return;
        }

        if (isLoadMore) {
          commitPosts((prev) => {
            const seen = new Set(prev.map((p) => p.id));
            return [...prev, ...page.filter((p) => !seen.has(p.id))];
          });
        } else {
          commitPosts(() => page);
        }
        offsetRef.current = offset + POSTS_PER_PAGE;
      } catch (err) {
        setError("Failed to load posts");
        console.error("Posts loading error:", err);
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    },
    [fetchPage, commitPosts],
  );

  const loadMorePosts = useCallback(() => {
    if (!loadingRef.current && hasMore) fetchPosts(true);
  }, [hasMore, fetchPosts]);

  const submitPost = useCallback(
    async (
      text: string,
      businessId?: string,
      _isJobUpdate = false,
      jobRole?: string,
      timePeriod?: string,
      salary?: number,
      isComment?: string,
    ): Promise<boolean> => {
      try {
        const { data, error } = await createPost(text, "story", businessId, jobRole, timePeriod, salary, isComment);
        if (error || !data) {
          console.error("Error creating post:", error);
          return false;
        }
        const newPost = transformPost(data);
        commitPosts((prev) => (prev.some((p) => p.id === newPost.id) ? prev : [newPost, ...prev]));
        return true;
      } catch (err) {
        console.error("Post submission error:", err);
        return false;
      }
    },
    [commitPosts],
  );

  const votePost = useCallback(
    async (postId: string, voteType: "up" | "down"): Promise<boolean> => {
      const post = postsRef.current.find((p) => p.id === postId);
      if (!post) return false;

      // Optimistic: apply now, persist in the background, roll back on failure.
      void applyOptimisticVote({
        currentUserVote: post.userVote ?? null,
        currentVotesTotal: post.votesTotal,
        voteType,
        apply: ({ newUserVote, newTotal }) => {
          setPosts((prev) =>
            prev.map((p) => (p.id === postId ? { ...p, votesTotal: newTotal, userVote: newUserVote } : p)),
          );
        },
        persist: async (newUserVote) => {
          const dbVoteType = newUserVote === "up" ? "upvote" : newUserVote === "down" ? "downvote" : null;
          const result = await persistVote("votes", "post_id", postId, dbVoteType);
          return result.success;
        },
      });

      return true;
    },
    [],
  );

  const removePost = useCallback(
    async (postId: string): Promise<boolean> => {
      const { success, error } = await deletePost(postId);
      if (!success) {
        console.error("Error deleting post:", error);
        return false;
      }
      // Drop the post and any comments under it.
      commitPosts((prev) => prev.filter((p) => p.id !== postId && p.isComment !== postId));
      return true;
    },
    [commitPosts],
  );

  const refetch = useCallback(() => {
    offsetRef.current = 0;
    fetchPosts(false);
  }, [fetchPosts]);

  // Initial load + realtime subscription.
  useEffect(() => {
    if (initialCachedPosts && initialCachedPosts.length > 0) setLoading(false);
    fetchPosts(false);

    const channel = supabase
      .channel("posts-changes")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "posts" }, async (payload) => {
        const inserted = payload.new as PostData;
        if (postsRef.current.some((p) => p.id === inserted.id)) return;
        // Our own inserts are already in state; for anyone else's we need the business join.
        const full = await getPostById(inserted.id);
        if (!full || full.is_deleted) return;
        const post = transformPost(full);
        commitPosts((prev) => (prev.some((p) => p.id === post.id) ? prev : [post, ...prev]));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "posts" }, (payload) => {
        const updated = payload.new as PostData;
        if (updated.is_deleted) {
          commitPosts((prev) => prev.filter((p) => p.id !== updated.id && p.isComment !== updated.id));
        } else {
          commitPosts((prev) =>
            prev.map((p) => (p.id === updated.id ? { ...p, votesTotal: updated.votes_total ?? p.votesTotal } : p)),
          );
        }
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "posts" }, (payload) => {
        const deleted = payload.old as PostData;
        commitPosts((prev) => prev.filter((p) => p.id !== deleted.id && p.isComment !== deleted.id));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // Mount-only by design; the callbacks read refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getBusinessPosts = useCallback(
    (businessId: string) => posts.filter((post) => post.businessId === businessId),
    [posts],
  );

  const getUserPosts = useCallback(() => posts.filter((post) => post.author === "You"), [posts]);

  /** The device's own posts plus any post it has commented on, newest first. */
  const getUserPostsAndCommented = useCallback(() => {
    const commentedIds = new Set(posts.filter((p) => p.author === "You" && p.isComment).map((p) => p.isComment!));
    return posts
      .filter((post) => !post.isComment && (post.author === "You" || commentedIds.has(post.id)))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }, [posts]);

  useReconnectionHandler({ onReconnect: refetch });

  return {
    posts,
    loading,
    error,
    hasMore,
    submitPost,
    votePost,
    removePost,
    refetch,
    loadMore: loadMorePosts,
    getBusinessPosts,
    getUserPosts,
    getUserPostsAndCommented,
  };
};
