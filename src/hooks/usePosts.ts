import { useState, useEffect, useCallback, useRef } from 'react';
import { getPosts, createPost, voteOnPost, deletePost, getUserVotes, transformPost, getUserProfile, Post, PostData } from '@/services/posts';
import { supabase } from '@/integrations/supabase/client';

// Module-level cache - survives component remounts
let modulePostsCache: Post[] = [];
let moduleCacheInitialized = false;
let moduleIsLoading = false;

// SessionStorage cache for persistence across page reloads
const POSTS_CACHE_KEY = 'posts_cache';
const POSTS_CACHE_VERSION_KEY = 'posts_cache_version';
const POSTS_CACHE_VERSION = '1.0';

const getCachedPosts = (): Post[] => {
  // First check module cache (faster)
  if (moduleCacheInitialized && modulePostsCache.length > 0) {
    console.log('📦 Using module cache:', modulePostsCache.length, 'posts');
    return modulePostsCache;
  }

  // Then check sessionStorage
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
    const posts = parsed.map((p: any) => ({
      ...p,
      createdAt: new Date(p.createdAt)
    }));
    
    // Populate module cache
    modulePostsCache = posts;
    moduleCacheInitialized = true;
    
    console.log('📦 Loaded from sessionStorage:', posts.length, 'posts');
    return posts;
  } catch (error) {
    console.warn('Failed to read posts cache:', error);
    return [];
  }
};

const saveCachedPosts = (posts: Post[]) => {
  // Save to both module cache and sessionStorage
  modulePostsCache = posts;
  moduleCacheInitialized = true;
  
  try {
    sessionStorage.setItem(POSTS_CACHE_KEY, JSON.stringify(posts));
  } catch (error) {
    console.warn('Failed to save posts cache:', error);
  }
};

const POSTS_PER_PAGE = 1000;

// Global subscription management
let globalSubscription: any = null;
let subscriptionCount = 0;

export const usePosts = () => {
  const [posts, setPosts] = useState<Post[]>(() => getCachedPosts());
  const [loading, setLoading] = useState(!moduleCacheInitialized);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  
  // Track if THIS instance has fetched
  const hasFetchedRef = useRef(false);
  const mountedRef = useRef(true);

  // Memoized fetch function
  const fetchPosts = useCallback(async (isLoadMore: boolean = false) => {
    // Prevent duplicate loads across ALL instances
    if (moduleIsLoading) {
      console.log('⏭️ Already loading posts globally, skipping...');
      return;
    }

    // If we have cache and this isn't a load-more, skip
    if (!isLoadMore && moduleCacheInitialized && modulePostsCache.length > 0) {
      console.log('✅ Using existing cached posts:', modulePostsCache.length);
      if (mountedRef.current) {
        setPosts(modulePostsCache);
        setLoading(false);
        hasFetchedRef.current = true;
      }
      return;
    }

    moduleIsLoading = true;
    if (mountedRef.current) {
      setLoading(true);
      setError(null);
    }
    
    try {
      const currentOffset = isLoadMore ? offset : 0;
      
      console.log(`🔄 Fetching posts (offset: ${currentOffset}, loadMore: ${isLoadMore})...`);
      
      const { data: postsData, error: postsError } = await getPosts(POSTS_PER_PAGE, currentOffset);
      
      if (postsError) {
        if (mountedRef.current) {
          setError('Failed to fetch posts');
        }
        console.error('❌ Posts fetch error:', postsError);
        return;
      }

      if (postsData && mountedRef.current) {
        setHasMore(postsData.length === POSTS_PER_PAGE);

        const { profileId: currentUserId } = await getUserProfile();

        const transformedPosts = await Promise.all(
          postsData.map(post => transformPost(post, [], currentUserId))
        );
        
        const postIds = transformedPosts.map(p => p.id);
        console.log('🗳️ Fetching user votes for', postIds.length, 'posts...');
        const userVotes = await getUserVotes(postIds);
        console.log('✅ Fetched user votes:', Object.keys(userVotes).length, 'votes');
        
        const postsWithVotes = transformedPosts.map(post => ({
          ...post,
          userVote: userVotes[post.id] || null
        }));
        
        if (isLoadMore) {
          setPosts(prevPosts => {
            const updatedPosts = [...prevPosts, ...postsWithVotes];
            saveCachedPosts(updatedPosts);
            console.log(`✅ Loaded ${postsWithVotes.length} more posts. Total: ${updatedPosts.length}`);
            return updatedPosts;
          });
          setOffset(currentOffset + POSTS_PER_PAGE);
        } else {
          setPosts(postsWithVotes);
          saveCachedPosts(postsWithVotes);
          setOffset(POSTS_PER_PAGE);
          console.log(`✅ Loaded ${postsWithVotes.length} posts (initial)`);
          hasFetchedRef.current = true;
        }
      }
    } catch (err) {
      if (mountedRef.current) {
        setError('Failed to load posts');
      }
      console.error('❌ Posts loading error:', err);
    } finally {
      moduleIsLoading = false;
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [offset]);

  const loadMorePosts = useCallback(() => {
    if (!loading && hasMore && !moduleIsLoading) {
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
          saveCachedPosts(updatedPosts);
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

    const { calculateVoteChange } = await import('@/utils/voteCalculations');
    const { persistVote } = await import('@/services/voting');

    const { newUserVote, newTotal } = calculateVoteChange(
      post.userVote,
      voteType,
      post.votesTotal
    );

    const previousVotesTotal = post.votesTotal;
    const previousUserVote = post.userVote;

    setPosts(prevPosts => {
      const updated = prevPosts.map(p =>
        p.id === postId
          ? { ...p, votesTotal: newTotal, userVote: newUserVote }
          : p
      );
      saveCachedPosts(updated);
      return updated;
    });

    const dbVoteType = newUserVote === 'up' ? 'upvote' : newUserVote === 'down' ? 'downvote' : null;
    persistVote('votes', 'post_id', postId, dbVoteType).catch(() => {
      setPosts(prevPosts => {
        const reverted = prevPosts.map(p =>
          p.id === postId
            ? { ...p, votesTotal: previousVotesTotal, userVote: previousUserVote }
            : p
        );
        saveCachedPosts(reverted);
        return reverted;
      });
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
        saveCachedPosts(filtered);
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
    mountedRef.current = true;

    // If already cached, just use it
    if (moduleCacheInitialized && modulePostsCache.length > 0) {
      console.log('✅ Using module cache on mount:', modulePostsCache.length);
      setPosts(modulePostsCache);
      setLoading(false);
      hasFetchedRef.current = true;
    } else if (!hasFetchedRef.current && !moduleIsLoading) {
      // Only fetch if no cache exists and we haven't fetched yet
      fetchPosts(false);
    }

    // Global subscription - only create once
    if (!globalSubscription) {
      subscriptionCount++;
      console.log('🔌 Creating realtime subscription (instance', subscriptionCount, ')');
      
      globalSubscription = supabase
        .channel('posts-changes')
        .on('postgres_changes', 
          { event: 'INSERT', schema: 'public', table: 'posts' },
          (payload) => {
            console.log('📨 New post received via realtime');
            // Clear cache and refetch for all instances
            if (!moduleIsLoading) {
              moduleCacheInitialized = false;
              modulePostsCache = [];
              fetchPosts(false);
            }
          }
        )
        .subscribe();
    } else {
      subscriptionCount++;
      console.log('🔌 Reusing existing subscription (instance', subscriptionCount, ')');
    }

    return () => {
      mountedRef.current = false;
      subscriptionCount--;
      
      // Only cleanup subscription when last instance unmounts
      if (subscriptionCount === 0 && globalSubscription) {
        console.log('🔌 Cleaning up realtime subscription');
        supabase.removeChannel(globalSubscription);
        globalSubscription = null;
      }
    };
  }, []); // Empty deps - run only once per mount

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
    moduleCacheInitialized = false;
    modulePostsCache = [];
    hasFetchedRef.current = false;
    setOffset(0);
    fetchPosts(false);
  }, [fetchPosts]);

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
