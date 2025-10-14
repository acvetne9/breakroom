import { useState, useEffect, useCallback } from 'react';
import { getPosts, createPost, voteOnPost, deletePost, getUserVotes, transformPost, getUserProfile, Post, PostData } from '@/services/posts';
import { supabase } from '@/integrations/supabase/client';

// SessionStorage cache for posts
const POSTS_CACHE_KEY = 'posts_cache';
const POSTS_CACHE_VERSION_KEY = 'posts_cache_version';
const POSTS_CACHE_VERSION = '1.0';

const getCachedPosts = (): Post[] => {
  try {
    const version = sessionStorage.getItem(POSTS_CACHE_VERSION_KEY);
    if (version !== POSTS_CACHE_VERSION) {
      sessionStorage.removeItem(POSTS_CACHE_KEY);
      sessionStorage.setItem(POSTS_CACHE_VERSION_KEY, POSTS_CACHE_VERSION);
      return [];
    }
    const cached = sessionStorage.getItem(POSTS_CACHE_KEY);
    if (!cached) return [];
    
    const parsed = JSON.parse(cached);
    // Convert date strings back to Date objects
    return parsed.map((p: any) => ({
      ...p,
      createdAt: new Date(p.createdAt)
    }));
  } catch (error) {
    console.warn('Failed to read posts cache:', error);
    return [];
  }
};

const saveCachedPosts = (posts: Post[]) => {
  try {
    sessionStorage.setItem(POSTS_CACHE_KEY, JSON.stringify(posts));
  } catch (error) {
    console.warn('Failed to save posts cache:', error);
  }
};

const POSTS_PER_PAGE = 1000;

export const usePosts = () => {
  const [posts, setPosts] = useState<Post[]>(getCachedPosts());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);

  // Fetch posts from backend with pagination
  const fetchPosts = useCallback(async (isLoadMore: boolean = false) => {
    setLoading(true);
    setError(null);
    
    try {
      const currentOffset = isLoadMore ? offset : 0;
      
      // ✅ getPosts now returns posts WITH businesses joined (including lat/lng)
      const { data: postsData, error: postsError } = await getPosts(POSTS_PER_PAGE, currentOffset);
      
      if (postsError) {
        setError('Failed to fetch posts');
        console.error('❌ Posts fetch error:', postsError);
        return;
      }

      if (postsData) {
        // Check if we've reached the end
        setHasMore(postsData.length === POSTS_PER_PAGE);

        // Get current user ID once to avoid race conditions
        const { profileId: currentUserId } = await getUserProfile();

        // Transform posts - businesses data is already joined and flattened in postsData
        const transformedPosts = await Promise.all(
          postsData.map(post => transformPost(post, [], currentUserId))
        );
        
        const postIds = transformedPosts.map(p => p.id);
        const userVotes = await getUserVotes(postIds);
        
        // Apply user votes to posts
        const postsWithVotes = transformedPosts.map(post => ({
          ...post,
          userVote: userVotes[post.id] || null
        }));
        
        if (isLoadMore) {
          // Append to existing posts using functional update
          setPosts(prevPosts => {
            const updatedPosts = [...prevPosts, ...postsWithVotes];
            saveCachedPosts(updatedPosts);
            console.log(`✅ Loaded ${postsWithVotes.length} more posts. Total: ${updatedPosts.length}`);
            return updatedPosts;
          });
          setOffset(currentOffset + POSTS_PER_PAGE);
        } else {
          // Replace posts (initial load or refresh)
          setPosts(postsWithVotes);
          saveCachedPosts(postsWithVotes);
          setOffset(POSTS_PER_PAGE);
          console.log(`✅ Loaded ${postsWithVotes.length} posts (initial)`);
        }
      }
    } catch (err) {
      setError('Failed to load posts');
      console.error('❌ Posts loading error:', err);
    } finally {
      setLoading(false);
    }
  }, [offset]);

  const loadMorePosts = useCallback(() => {
    if (!loading && hasMore) {
      fetchPosts(true);
    }
  }, [loading, hasMore, fetchPosts]);

  // Submit a new post
  const submitPost = async (
    text: string,
    businessId?: string,
    isJobUpdate: boolean = false,
    jobRole?: string,
    timePeriod?: string,
    salary?: number,
    isComment?: string
  ): Promise<boolean> => {
    try {
      // Always use 'story' as post_type since that's what the database allows
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
        // Get current user ID and transform the new post
        const { profileId: currentUserId } = await getUserProfile();
        const newPost = await transformPost(data, [], currentUserId);
        setPosts(prevPosts => [newPost, ...prevPosts]);
        return true;
      }
    } catch (err) {
      console.error('Post submission error:', err);
    }
    return false;
  };

  // Vote on a post with optimistic updates
  const votePost = async (postId: string, voteType: 'up' | 'down'): Promise<boolean> => {
    const post = posts.find(p => p.id === postId);
    if (!post) return false;

    // Import vote calculation utility
    const { calculateVoteChange } = await import('@/utils/voteCalculations');
    const { persistVote } = await import('@/services/voting');

    // Calculate new state optimistically
    const { newUserVote, newTotal } = calculateVoteChange(
      post.userVote,
      voteType,
      post.votesTotal
    );

    // Store previous state for rollback
    const previousVotesTotal = post.votesTotal;
    const previousUserVote = post.userVote;

    // Update UI immediately
    setPosts(prevPosts =>
      prevPosts.map(p =>
        p.id === postId
          ? { ...p, votesTotal: newTotal, userVote: newUserVote }
          : p
      )
    );

    // Persist in background (don't await!)
    const dbVoteType = newUserVote === 'up' ? 'upvote' : newUserVote === 'down' ? 'downvote' : null;
    persistVote('votes', 'post_id', postId, dbVoteType).catch(() => {
      // Rollback on error
      setPosts(prevPosts =>
        prevPosts.map(p =>
          p.id === postId
            ? { ...p, votesTotal: previousVotesTotal, userVote: previousUserVote }
            : p
        )
      );
    });

    return true;
  };

  // Delete a post
  const removePost = async (postId: string): Promise<boolean> => {
    try {
      const { success, error } = await deletePost(postId);

      if (!success) {
        console.error('Error deleting post:', error);
        return false;
      }

      // Remove from local state
      setPosts(prevPosts => prevPosts.filter(post => post.id !== postId));
      return true;
    } catch (err) {
      console.error('Delete error:', err);
      return false;
    }
  };

  // Set up real-time subscription
  useEffect(() => {
    // Load from cache immediately if available
    const cachedPosts = getCachedPosts();
    if (cachedPosts.length > 0) {
      console.log(`📦 Loaded ${cachedPosts.length} posts from cache`);
      setLoading(false);
    }
    
    fetchPosts(false);

    // Subscribe to real-time changes for new posts only
    const channel = supabase
      .channel('posts-changes')
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'posts' },
        () => {
          // Refetch initial batch when new posts are added
          setOffset(0);
          fetchPosts(false);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Filter posts by business
  const getBusinessPosts = (businessId: string) => {
    return posts.filter(post => post.businessId === businessId);
  };

  // Filter user's posts and posts they've commented on
  const getUserPostsAndCommented = () => {
    const userPosts = posts.filter(post => post.author === 'You');
    
    // Get posts that user has commented on from localStorage
    const commentedPostIds = JSON.parse(localStorage.getItem('userCommentedPosts') || '[]');
    const commentedPosts = posts.filter(post => 
      post.author !== 'You' && commentedPostIds.includes(post.id)
    );
    
    // Combine and sort by creation date (newest first)
    const allUserRelatedPosts = [...userPosts, ...commentedPosts];
    return allUserRelatedPosts.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  };

  // Filter user's posts only (original function for backward compatibility)
  const getUserPosts = () => {
    return posts.filter(post => post.author === 'You');
  };

  // Track when user comments on a post
  const trackCommentedPost = (postId: string) => {
    const commentedPostIds = JSON.parse(localStorage.getItem('userCommentedPosts') || '[]');
    if (!commentedPostIds.includes(postId)) {
      commentedPostIds.push(postId);
      localStorage.setItem('userCommentedPosts', JSON.stringify(commentedPostIds));
    }
  };

  return {
    posts,
    loading,
    error,
    hasMore,
    submitPost,
    votePost,
    removePost,
    refetch: () => fetchPosts(false),
    loadMore: loadMorePosts,
    getBusinessPosts,
    getUserPosts,
    getUserPostsAndCommented,
    trackCommentedPost
  };
};