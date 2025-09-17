import { useState, useEffect } from 'react';
import { getPosts, createPost, voteOnPost, deletePost, getUserVotes, transformPost, Post, PostData } from '@/services/posts';
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
        console.error('Posts fetch error:', postsError);
        return;
      }

      if (postsData) {
        // Transform posts without businesses data for now
        const transformedPosts = postsData.map(post => transformPost(post, []));
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
      console.error('Posts loading error:', err);
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
    salary?: number
  ): Promise<boolean> => {
    try {
      const postType = isJobUpdate ? 'job_update' : 'story';
      
      const { data, error } = await createPost(
        text,
        postType,
        businessId,
        jobRole,
        timePeriod,
        salary
      );

      if (error) {
        console.error('Error creating post:', error);
        return false;
      }

      if (data) {
        // Add the new post to the local state (without businesses data for now)
        const newPost = transformPost(data, []);
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

  // Filter user's posts
  const getUserPosts = () => {
    return posts.filter(post => post.author === 'You');
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
    getUserPosts
  };
};