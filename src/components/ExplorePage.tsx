import React, { useState, useMemo, memo, useEffect } from 'react';
import { Eye } from 'lucide-react';
import { isProfane } from '../utils/profanityFilter';
import { usePosts } from '@/hooks/usePosts';
import VotingComponent from './VotingComponent';
import { formatTimeAgo } from '../utils/timeAgo';
import { TranslatedText } from './TranslatedText';
import { useToast } from '@/hooks/use-toast';

interface Post {
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
}

interface ExplorePageProps {
  filteredBusinessId?: string;
  filteredUserStories?: boolean;
  onBusinessView?: (businessId: string) => void;
  onExpandedPostChange?: (postId: string | null) => void;
  onCommentSubmit?: (postId: string, comment: string) => void;
  onBackToAllPosts?: () => void;
  onNavigateToHomeBusiness?: (businessId: string) => void;
  onBusinessPreview?: (businessId: string) => void;
  onFlyToBusiness?: (businessId: string) => void; // 🚀 NEW
}

const ExplorePage: React.FC<ExplorePageProps> = ({
  filteredBusinessId,
  filteredUserStories,
  onBusinessView,
  onExpandedPostChange,
  onCommentSubmit,
  onBackToAllPosts,
  onNavigateToHomeBusiness,
  onBusinessPreview,
  onFlyToBusiness,
}) => {
  console.log('🔍 ExplorePage component initializing...');
  
  const { posts, loading, submitPost, votePost, removePost, trackCommentedPost } = usePosts();
  const [expandedPost, setExpandedPost] = useState<string | null>(null);
  const [fadeOutSystemPost, setFadeOutSystemPost] = useState(false);
  const [hideSystemPost, setHideSystemPost] = useState(false);

  const defaultPlaceholder = filteredBusinessId ? "Thoughts about this business?" : "How's work?";
  const [postPlaceholder, setPostPlaceholder] = useState(defaultPlaceholder);
  
  // 2️⃣ Reset placeholder whenever filteredBusinessId changes
  useEffect(() => {
    setPostPlaceholder(filteredBusinessId ? "Thoughts about this business?" : "How's work?");
  }, [filteredBusinessId]);

  interface Comment {
    id: string;
    author: string;
    text: string;
    createdAt: Date;
  }

  const [comments, setComments] = useState<{ [postId: string]: Comment[] }>({});
  const [postText, setPostText] = useState('');
  const [commentText, setCommentText] = useState('');
  const [commentPlaceholder, setCommentPlaceholder] = useState("Leave a comment!");
  const { toast } = useToast();

  // Check if we need to fade out the system post when real posts are added
  const realPosts = useMemo(() => {
    return filteredBusinessId 
      ? posts.filter(post => post.businessId === filteredBusinessId && !post.isJobUpdate && post.author !== 'System')
      : filteredUserStories 
      ? posts.filter(post => post.author === 'You' && !post.isJobUpdate)
      : posts.filter(post => post.author !== 'System');
  }, [posts, filteredBusinessId, filteredUserStories]);

  useEffect(() => {
    if (filteredBusinessId && realPosts.length > 0 && !fadeOutSystemPost && !hideSystemPost) {
      // Start fade out animation
      setFadeOutSystemPost(true);
      
      // After animation completes, hide the system post
      setTimeout(() => {
        setHideSystemPost(true);
        setFadeOutSystemPost(false);
      }, 500); // Match the animation duration
    }
    
    // Reset states when switching to different business or no filter
    if (!filteredBusinessId || realPosts.length === 0) {
      setFadeOutSystemPost(false);
      setHideSystemPost(false);
    }
  }, [realPosts.length, filteredBusinessId, fadeOutSystemPost, hideSystemPost]);

  const handlePostSubmit = async () => {
    if (!postText.trim()) return;
  
    if (isProfane(postText)) {
      setPostText('');
      setPostPlaceholder('Post blocked: Inappropriate content detected');
      return;
    }
  
    const success = await submitPost(postText, filteredBusinessId);
    if (success) {
      setPostText('');
      setPostPlaceholder(filteredBusinessId ? "Thoughts about this business?" : "How's work?");
    } else {
      setPostText('');
      setPostPlaceholder('Failed to create post. Please try again.');
    }
  };

  const handleCommentSubmit = async () => {
    if (!commentText.trim() || !expandedPost) return;
  
    if (isProfane(commentText)) {
      setCommentText('');
      return;
    }
  
    // Save comment to database
    const success = await submitPost(commentText, undefined, false, undefined, undefined, undefined, expandedPost);
    
    if (success) {
      // Track that user commented on this post
      trackCommentedPost(expandedPost);
      setCommentText('');
      setCommentPlaceholder("Leave a comment!");
      onCommentSubmit?.(expandedPost, commentText);
    } else {
      setCommentPlaceholder("Connection error. Please try again.");
      setCommentText('');
    }
  };

  const handleCommentDelete = (postId: string, commentId: string) => {
    setComments({
      ...comments,
      [postId]: (comments[postId] || []).filter(c => c.id !== commentId),
    });
  };

  const handlePostClick = (postId: string) => {
    // If clicking the same post, toggle closed
    setExpandedPost(prev => prev === postId ? null : postId);
    onExpandedPostChange?.(expandedPost === postId ? null : postId);
  };

  const handleBusinessView = (businessId: string) => {
    console.log('👀 Eye clicked - navigating and flying to business:', businessId);
  
    // First, request map fly-to if available
    if (onFlyToBusiness) {
      onFlyToBusiness(businessId);
    }
  
    // Keep existing navigation fallback
    if (onNavigateToHomeBusiness) {
      onNavigateToHomeBusiness(businessId);
    } else {
      onBusinessView?.(businessId);
    }
  };

  const handlePostVote = async (postId: string, voteType: 'up' | 'down') => {
    const success = await votePost(postId, voteType);
    if (!success) {
      toast({
        title: "Error",
        description: "Failed to vote. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handlePostDelete = async (postId: string) => {
    const success = await removePost(postId);
  
    if (!success) {
      setPostText('');
      setPostPlaceholder('Failed to create post. Please try again.');
      return;
    }
  
    if (expandedPost === postId) {
      setExpandedPost(null);
      setCommentText('');
      setPostPlaceholder(filteredBusinessId ? "Thoughts about this business?" : "How's work?");
    }
  };

  useEffect(() => {
    if (!expandedPost) {
      setCommentText('');
      setPostPlaceholder(
        filteredBusinessId ? "Thoughts about this business?" : "How's work?"
      );
    }
  }, [expandedPost, filteredBusinessId]);


  const displayPosts = useMemo(() => {
    let filtered: Post[] = [];
  
    if (filteredBusinessId) {
      // Include all posts for this business (including system)
      filtered = posts.filter(post => post.businessId === filteredBusinessId && !post.isJobUpdate);
    } else if (filteredUserStories) {
      filtered = posts.filter(post => post.author === 'You' && !post.isJobUpdate);
    } else {
      filtered = posts;
    }
  
    // Check for real (non-system) posts for this business
    const realBusinessPosts = filtered.filter(post => post.author !== 'System');
  
    // Add default system post if business has no real posts
    if (filteredBusinessId && realBusinessPosts.length === 0) {
      const defaultPost: Post = {
        id: `default-${filteredBusinessId}`,
        author: 'System',
        text: 'Share a thought about this business 💭',
        businessId: filteredBusinessId,
        isStory: true,
        upvotes: 0,
        downvotes: 0,
        userVote: null,
        createdAt: new Date()
      };
      filtered = [defaultPost, ...filtered];
    }
  
    return filtered;
  }, [posts, filteredBusinessId, filteredUserStories]);


  if (loading) {
    return (
      <div className="relative w-full h-full flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-app-yellow mx-auto mb-4"></div>
          <p className="text-app-gray-medium">Loading posts...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      {/* Posts list */}
      <div className={`h-full overflow-y-auto pb-20 ${filteredBusinessId || filteredUserStories ? 'pt-20' : 'pt-20'}`}>
        <div className="space-y-4 px-4">
          {displayPosts.map(post => (
            <div key={post.id} className="relative">
              {/* Post with background collage if business has 5+ photos */}
              <div
                className={`app-popup-transparent p-4 cursor-pointer ${post.images && post.images.length >= 5 ? 'relative overflow-hidden' : ''} ${
                  post.author === 'System' && fadeOutSystemPost ? 'animate-fade-out opacity-0 transition-opacity duration-500' : ''
                }`}
                onClick={() => handlePostClick(post.id)}
                style={{
                  backgroundImage: post.images && post.images.length >= 5 ? `url(${post.images[0]})` : undefined,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center'
                }}
              >
                {/* Background collage overlay */}
                {post.images && post.images.length >= 5 && (
                  <div className="absolute inset-0 opacity-30">
                    <div className="grid grid-cols-3 h-full">
                      {post.images.slice(0, 6).map((img, idx) => (
                        <div
                          key={idx}
                          className="bg-cover bg-center"
                          style={{ backgroundImage: `url(${img})` }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Post content */}
                <div className={`relative z-10 pb-10 ${post.images && post.images.length >= 5 ? 'post-overlay rounded-lg p-3' : ''}`}>
                  <div className="flex items-start justify-between mb-2">
                    <TranslatedText 
                      text={post.text}
                      className={`flex-1 pr-4 break-words overflow-wrap-break-word ${
                        post.author === 'System' 
                          ? 'text-app-gray-medium italic' 
                          : 'text-app-black'
                      }`}
                    />
                    <div className="flex-shrink-0 w-8 flex justify-center mt-1 my-0">
                      {post.businessId && (
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            handleBusinessView(post.businessId);
                          }}
                          className="flex items-center space-x-1 text-app-gray-medium hover:text-app-black"
                        >
                          <span className="py-0 my-0">👀</span>
                        </button>
                      )}
                    </div>
                  </div>
                  
                  {/* Timestamp in bottom left */}
                  <div className="absolute bottom-1 left-1">
                    <span className="text-xs text-gray-400">
                      {post.author === 'System' ? 'Click to share!' : formatTimeAgo(post.createdAt)}
                    </span>
                  </div>
                  
                  {/* Voting component in bottom right */}
                  {post.author !== 'System' && (
                    <div className="absolute bottom-1 right-1">
                      <VotingComponent 
                        upvotes={post.upvotes} 
                        downvotes={post.downvotes} 
                        userVote={post.userVote} 
                        onVote={voteType => handlePostVote(post.id, voteType)}
                        isOwner={post.author === 'You'}
                        onDelete={() => handlePostDelete(post.id)}
                      />
                    </div>
                  )}
                </div>

                {/* Expanded view */}
                {expandedPost === post.id && (
                  <div className="mt-4 pt-4 border-t border-app-gray-light space-y-2">
                    {(() => {
                      // Order comments: post author's comments first
                      const orderedComments = (comments[post.id] || []).slice().sort((a, b) => {
                        if (a.author === post.author && b.author !== post.author) return -1;
                        if (b.author === post.author && a.author !== post.author) return 1;
                        return a.createdAt.getTime() - b.createdAt.getTime();
                      });
                
                      if (orderedComments.length === 0) {
                        return (
                          <h4 className="text-sm font-medium mb-2 text-slate-500 text-left">
                            Be the first to share! 😉
                          </h4>
                        );
                      }
                
                      return orderedComments.map(comment => (
                        <div key={comment.id} className="flex items-center justify-between py-1">
                          <TranslatedText text={comment.text} className="text-sm text-app-gray-dark pr-2" />
                          <div className="flex-shrink-0">
                            <VotingComponent
                              upvotes={0}
                              downvotes={0}
                              userVote={null}
                              onVote={() => {}}
                              isOwner={comment.author === 'You'}
                              onDelete={() => handleCommentDelete(post.id, comment.id)}
                            />
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Input bar at bottom */}
      <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-20">
        {expandedPost ? (
          // Comment input when post is expanded
          <div className="relative">
            <input
              type="text"
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              placeholder={commentPlaceholder}
              className="search-bar pr-14"
              onKeyPress={e => {
                if (e.key === 'Enter') {
                  handleCommentSubmit();
                }
              }}
            />
            <button
              onClick={handleCommentSubmit}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-lg bg-transparent"
            >
              🗣️
            </button>
          </div>
        ) : (
          // Post input for explore page
          <div className="relative">
            <input
              type="text"
              value={postText}
              onChange={e => setPostText(e.target.value)}
              placeholder={postPlaceholder}
              className="search-bar pr-14"
              onKeyPress={e => {
                if (e.key === 'Enter') handlePostSubmit();
              }}
            />
            <button
              onClick={handlePostSubmit}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-lg bg-transparent"
            >
              🗣️
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ExplorePage;