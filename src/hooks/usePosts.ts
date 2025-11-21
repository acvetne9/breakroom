import { useState, useEffect, useCallback, useRef } from 'react';
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
  const [posts, setPosts] = useState<Post[]>(() => getCachedPosts());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  
  // Track if initial fetch has happened
  const hasFetchedRef = useRef(false);
  const isSubscribedRef = useRef(false);

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
      const currentOffset = isLoadMore ? offset : 0;
      
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

    setPosts(prevPosts =>
      prevPosts.map(p =>
        p.id === postId
          ? { ...p, votesTotal: newTotal, userVote: newUserVote }
          : p
      )
    );

    const dbVoteType = newUserVote === 'up' ? 'upvote' : newUserVote === 'down' ? 'downvote' : null;
    persistVote('votes', 'post_id', postId, dbVoteType).catch(() => {
      setPosts(prevPosts =>
        prevPosts.map(p =>
          p.id === postId
            ? { ...p, votesTotal: previousVotesTotal, userVote: previousUserVote }
            : p
        )
      );
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
    // Only run once
    if (hasFetchedRef.current) {
      console.log('⏭️ Skipping duplicate useEffect run');
      return;
    }

    // Load from cache immediately if available
    const cachedPosts = getCachedPosts();
    if (cachedPosts.length > 0) {
      console.log(`📦 Loaded ${cachedPosts.length} posts from cache`);
      setPosts(cachedPosts);
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
                saveCachedPosts(filtered);
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
              saveCachedPosts(filtered);
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
