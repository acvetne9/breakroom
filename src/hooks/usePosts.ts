import { useState, useEffect } from 'react';
import { getPosts, createPost, voteOnPost, deletePost, getUserVotes, transformPost, getUserProfile, Post, PostData } from '@/services/posts';
import { supabase } from '@/integrations/supabase/client';

export const usePosts = () => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch posts from backend
  const fetchPosts = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const { data: postsData, error: postsError } = await getPosts();
      
      if (postsError) {
        setError('Failed to fetch posts');
        console.error('❌ Posts fetch error:', postsError);
        return;
      }

      if (postsData) {
        // Get businesses
        const { data: businesses } = await supabase
          .from('businesses')
          .select('*');

        // Get current user ID once to avoid race conditions
        const currentUserId = await getUserProfile();

        // Transform posts with cached user ID
        const transformedPosts = await Promise.all(
          postsData.map(post => transformPost(post, businesses || [], currentUserId))
        );
        
        const postIds = transformedPosts.map(p => p.id);
        const userVotes = await getUserVotes(postIds);
        
        // Apply user votes to posts
        const postsWithVotes = transformedPosts.map(post => ({
          ...post,
          userVote: userVotes[post.id] || null
        }));
        
        setPosts(postsWithVotes);
      }
    } catch (err) {
      setError('Failed to load posts');
      console.error('❌ Posts loading error:', err);
    } finally {
      setLoading(false);
    }
  };

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
        const currentUserId = await getUserProfile();
        const newPost = await transformPost(data, [], currentUserId);
        setPosts(prevPosts => [newPost, ...prevPosts]);
        return true;
      }
    } catch (err) {
      console.error('Post submission error:', err);
    }
    return false;
  };

  // Vote on a post
  const votePost = async (postId: string, voteType: 'up' | 'down'): Promise<boolean> => {
    try {
      const dbVoteType = voteType === 'up' ? 'upvote' : 'downvote';
      const { success, error } = await voteOnPost(postId, dbVoteType);

      if (!success) {
        console.error('Error voting on post:', error);
        return false;
      }

      // Update local state optimistically
      setPosts(prevPosts => 
        prevPosts.map(post => {
          if (post.id === postId) {
            let newUpvotes = post.upvotes;
            let newDownvotes = post.downvotes;
            let newUserVote: 'up' | 'down' | null = post.userVote;

            if (voteType === 'up') {
              if (post.userVote === 'up') {
                // Remove upvote
                newUpvotes--;
                newUserVote = null;
              } else if (post.userVote === 'down') {
                // Switch from downvote to upvote
                newDownvotes--;
                newUpvotes++;
                newUserVote = 'up';
              } else {
                // Add upvote
                newUpvotes++;
                newUserVote = 'up';
              }
            } else {
              if (post.userVote === 'down') {
                // Remove downvote
                newDownvotes--;
                newUserVote = null;
              } else if (post.userVote === 'up') {
                // Switch from upvote to downvote
                newUpvotes--;
                newDownvotes++;
                newUserVote = 'down';
              } else {
                // Add downvote
                newDownvotes++;
                newUserVote = 'down';
              }
            }

            return {
              ...post,
              upvotes: newUpvotes,
              downvotes: newDownvotes,
              userVote: newUserVote
            };
          }
          return post;
        })
      );

      return true;
    } catch (err) {
      console.error('Vote error:', err);
      return false;
    }
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
    fetchPosts();

    // Subscribe to real-time changes
    const channel = supabase
      .channel('posts-changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'posts' },
        () => {
          // Refetch posts when changes occur
          fetchPosts();
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
    submitPost,
    votePost,
    removePost,
    refetch: fetchPosts,
    getBusinessPosts,
    getUserPosts,
    getUserPostsAndCommented,
    trackCommentedPost
  };
};