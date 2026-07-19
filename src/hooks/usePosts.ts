import { useState, useEffect, useCallback, useRef } from 'react';
import { getPosts, createPost, deletePost, getUserVotes, transformPost, getUserProfile, Post, PostData } from '@/services/posts';
import { supabase } from '@/integrations/supabase/client';
import { useSessionCache } from './useSessionCache';
import { useReconnectionHandler } from './useReconnectionHandler';

const POSTS_PER_PAGE = 30;

export const usePosts = () => {
  // Use reusable cache hook
  const { cachedData: initialCachedPosts, saveToCache } = useSessionCache<Post[]>({
    key: 'posts_cache',
    version: '1.0',
    deserialize: (data: any[]) => data.map((p: any) => ({
      ...p,
      createdAt: new Date(p.createdAt)
    })),
  });

  const [posts, setPosts] = useState<Post[]>(initialCachedPosts || []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);

  // Track if initial fetch has happened
  const hasFetchedRef = useRef(false);
  const isSubscribedRef = useRef(false);

  // Keep a ref of the current offset so fetchPosts can stay stable
  // (avoids re-registering the reconnect callback on every loadMore)
  const offsetRef = useRef(0);

  // Memoized fetch function
  const fetchPosts = useCallback(async (isLoadMore: boolean = false) => {
    // Prevent duplicate initial loads
    if (!isLoadMore && hasFetchedRef.current) {
      console.log('⏭️ Skipping duplicate initial fetch');
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      const currentOffset = isLoadMore ? offsetRef.current : 0;

      const { data: postsData, error: postsError } = await getPosts(POSTS_PER_PAGE, currentOffset);
      
      if (postsError) {
        setError('Failed to fetch posts');
        console.error('❌ Posts fetch error:', postsError);
        return;
      }

      if (postsData) {
        setHasMore(postsData.length === POSTS_PER_PAGE);

        const { profileId: currentUserId } = await getUserProfile();

        const transformedPosts = await Promise.all(
          postsData.map(post => transformPost(post, [], currentUserId))
        );
        
        const postIds = transformedPosts.map(p => p.id);
        const userVotes = await getUserVotes(postIds);
        
        const postsWithVotes = transformedPosts.map(post => ({
          ...post,
          userVote: userVotes[post.id] || null
        }));
        
        if (isLoadMore) {
          setPosts(prevPosts => {
            const updatedPosts = [...prevPosts, ...postsWithVotes];
            saveToCache(updatedPosts);
            console.log(`✅ Loaded ${postsWithVotes.length} more posts. Total: ${updatedPosts.length}`);
            return updatedPosts;
          });
          offsetRef.current = currentOffset + POSTS_PER_PAGE;
          setOffset(offsetRef.current);
        } else {
          setPosts(postsWithVotes);
          saveToCache(postsWithVotes);
          offsetRef.current = POSTS_PER_PAGE;
          setOffset(POSTS_PER_PAGE);
          console.log(`✅ Loaded ${postsWithVotes.length} posts (initial)`);
          hasFetchedRef.current = true;
        }
      }
    } catch (err) {
      setError('Failed to load posts');
      console.error('❌ Posts loading error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMorePosts = useCallback(() => {
    if (!loading && hasMore) {
      fetchPosts(true);
    }
  }, [loading, hasMore, fetchPosts]);

  const submitPost = useCallback(async (
    text: string,
    businessId?: string,
    isJobUpdate: boolean = false,
    jobRole?: string,
    timePeriod?: string,
    salary?: number,
    isComment?: string
  ): Promise<boolean> => {
    try {
      const postType = 'story';
      
      const { data, error } = await createPost(
        text,
        postType,
        businessId,
        jobRole,
        timePeriod,
        salary,
        isComment
      );

      if (error) {
        console.error('Error creating post:', error);
        return false;
      }

      if (data) {
        const { profileId: currentUserId } = await getUserProfile();
        const newPost = await transformPost(data, [], currentUserId);
        
        if (!(newPost.createdAt instanceof Date) || isNaN(newPost.createdAt.getTime())) {
          console.error('⚠️ Post created without valid date:', newPost);
          newPost.createdAt = new Date();
        }
        
        setPosts(prevPosts => {
          const updatedPosts = [newPost, ...prevPosts];
          saveToCache(updatedPosts);
          return updatedPosts;
        });
        
        return true;
      }
    } catch (err) {
      console.error('Post submission error:', err);
    }
    return false;
  }, []);

  const votePost = useCallback(async (postId: string, voteType: 'up' | 'down'): Promise<boolean> => {
    const post = posts.find(p => p.id === postId);
    if (!post) return false;

    const { applyOptimisticVote } = await import('./useOptimisticVote');
    const { persistVote } = await import('@/services/voting');

    // Fire-and-forget: apply the optimistic update, persist in the background,
    // and roll back on failure. We do not await so votePost stays responsive.
    void applyOptimisticVote({
      currentUserVote: post.userVote,
      currentVotesTotal: post.votesTotal,
      voteType,
      apply: ({ newUserVote, newTotal }) => {
        setPosts(prevPosts =>
          prevPosts.map(p =>
            p.id === postId
              ? { ...p, votesTotal: newTotal, userVote: newUserVote }
              : p
          )
        );
      },
      persist: async (newUserVote) => {
        const dbVoteType = newUserVote === 'up' ? 'upvote' : newUserVote === 'down' ? 'downvote' : null;
        // Preserve original semantics: the previous implementation used a
        // `.catch()`, so it only rolled back on a rejected promise (persistVote
        // resolves with { success } rather than rejecting). Await here so a
        // genuine rejection propagates and triggers rollback, but treat a
        // resolved value as success regardless of the `success` flag.
        await persistVote('votes', 'post_id', postId, dbVoteType);
        return true;
      },
    });

    return true;
  }, [posts]);

  const removePost = useCallback(async (postId: string): Promise<boolean> => {
    try {
      const { success, error } = await deletePost(postId);

      if (!success) {
        console.error('Error deleting post:', error);
        return false;
      }

      setPosts(prevPosts => {
        const filtered = prevPosts.filter(post => post.id !== postId);
        saveToCache(filtered);
        return filtered;
      });
      
      try {
        const commentedPostIds = JSON.parse(localStorage.getItem('userCommentedPosts') || '[]');
        const updatedIds = commentedPostIds.filter((id: string) => id !== postId);
        localStorage.setItem('userCommentedPosts', JSON.stringify(updatedIds));
      } catch (err) {
        console.warn('Failed to clean up commented posts tracking:', err);
      }
      
      return true;
    } catch (err) {
      console.error('Delete error:', err);
      return false;
    }
  }, []);

  // Single effect for initialization and subscription
  useEffect(() => {
    // Only run once
    if (hasFetchedRef.current) {
      console.log('⏭️ Skipping duplicate useEffect run');
      return;
    }

    // Load from cache immediately if available
    if (initialCachedPosts && initialCachedPosts.length > 0) {
      console.log(`📦 Loaded ${initialCachedPosts.length} posts from cache`);
      setLoading(false);
    }
    
    // Fetch fresh data
    fetchPosts(false);

    // Subscribe to real-time changes only once
    if (!isSubscribedRef.current) {
      isSubscribedRef.current = true;
      
      const channel = supabase
        .channel('posts-changes')
        .on('postgres_changes', 
          { event: 'INSERT', schema: 'public', table: 'posts' },
          (payload) => {
            console.log('📨 New post received via realtime');
            // Only refetch if we're not already loading
            if (!loading) {
              offsetRef.current = 0;
              setOffset(0);
              hasFetchedRef.current = false; // Allow refetch
              fetchPosts(false);
            }
          }
        )
        .on('postgres_changes', 
          { event: 'UPDATE', schema: 'public', table: 'posts' },
          (payload) => {
            console.log('📝 Post updated via realtime');
            const updatedPost = payload.new as PostData;
            // If post was soft deleted, remove it from local state
            if (updatedPost.is_deleted) {
              setPosts(prev => {
                const filtered = prev.filter(p => p.id !== updatedPost.id);
                saveToCache(filtered);
                console.log(`🗑️ Removed soft-deleted post ${updatedPost.id} from state`);
                return filtered;
              });
            }
          }
        )
        .on('postgres_changes', 
          { event: 'DELETE', schema: 'public', table: 'posts' },
          (payload) => {
            console.log('🗑️ Post hard deleted via realtime');
            const deletedPost = payload.old as PostData;
            // Remove hard deleted post from local state
            setPosts(prev => {
              const filtered = prev.filter(p => p.id !== deletedPost.id);
              saveToCache(filtered);
              console.log(`🗑️ Removed hard-deleted post ${deletedPost.id} from state`);
              return filtered;
            });
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
        isSubscribedRef.current = false;
      };
    }
  }, []); // Empty deps - run only once

  const getBusinessPosts = useCallback((businessId: string) => {
    return posts.filter(post => post.businessId === businessId);
  }, [posts]);

  const getUserPostsAndCommented = useCallback(() => {
    const userPosts = posts.filter(post => post.author === 'You');
    
    const commentedPostIds = JSON.parse(localStorage.getItem('userCommentedPosts') || '[]');
    const commentedPosts = posts.filter(post => 
      post.author !== 'You' && commentedPostIds.includes(post.id)
    );
    
    const allUserRelatedPosts = [...userPosts, ...commentedPosts];
    return allUserRelatedPosts.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [posts]);

  const getUserPosts = useCallback(() => {
    return posts.filter(post => post.author === 'You');
  }, [posts]);

  const trackCommentedPost = useCallback((postId: string) => {
    const commentedPostIds = JSON.parse(localStorage.getItem('userCommentedPosts') || '[]');
    if (!commentedPostIds.includes(postId)) {
      commentedPostIds.push(postId);
      localStorage.setItem('userCommentedPosts', JSON.stringify(commentedPostIds));
    }
  }, []);

  const refetch = useCallback(() => {
    hasFetchedRef.current = false;
    offsetRef.current = 0;
    setOffset(0);
    fetchPosts(false);
  }, [fetchPosts]);

  // Automatically refetch posts when connection is restored
  useReconnectionHandler({
    onReconnect: refetch
  });

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
    trackCommentedPost
  };
};
