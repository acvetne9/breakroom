import React, { useState, useMemo, memo, useEffect } from 'react';
import { isProfane } from '../utils/profanityFilter';
import { useToast } from '@/hooks/use-toast';
import VotingComponent from './VotingComponent';
import { formatTimeAgo } from '../utils/timeAgo';
import { TranslatedText } from './TranslatedText';

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
}

interface Comment {
  id: string;
  author: string;
  text: string;
  createdAt: Date;
}

interface ExplorePageProps {
  posts: Post[];
  filteredBusinessId?: string;
  filteredUserStories?: boolean;
  onBusinessView?: (businessId: string) => void;
  onExpandedPostChange?: (postId: string | null) => void;
  onCommentSubmit?: (postId: string, comment: string) => void;
  onPostSubmit?: (text: string, businessId?: string) => void;
  onBackToAllPosts?: () => void;
  onPostVote?: (postId: string, voteType: 'up' | 'down') => void;
  onPostDelete?: (postId: string) => void;
}

const ExplorePage: React.FC<ExplorePageProps> = memo(({
  posts,
  filteredBusinessId,
  filteredUserStories = false,
  onBusinessView,
  onExpandedPostChange,
  onCommentSubmit,
  onPostSubmit,
  onBackToAllPosts,
  onPostVote,
  onPostDelete
}) => {
  const [expandedPost, setExpandedPost] = useState<string | null>(null);
  const [comments, setComments] = useState<{ [postId: string]: Comment[] }>({});
  const [postText, setPostText] = useState('');
  const [commentText, setCommentText] = useState('');
  const { toast } = useToast();

  // Submit new post
  const handlePostSubmit = () => {
    if (!postText.trim()) return;
    if (isProfane(postText)) {
      toast({
        title: "Post blocked",
        description: "Inappropriate content detected",
        variant: "destructive"
      });
      setPostText('');
      return;
    }
    onPostSubmit?.(postText, filteredBusinessId);
    setPostText('');
  };

  // Submit new comment
  const handleCommentSubmit = () => {
    if (!commentText.trim() || !expandedPost) return;
    if (isProfane(commentText)) {
      toast({
        title: "Comment blocked",
        description: "Inappropriate content detected",
        variant: "destructive",
      });
      setCommentText('');
      return;
    }

    const newComment: Comment = {
      id: crypto.randomUUID(),
      author: "You", // replace with logged-in user info
      text: commentText,
      createdAt: new Date(),
    };

    setComments({
      ...comments,
      [expandedPost]: [...(comments[expandedPost] || []), newComment],
    });

    setCommentText('');
    onCommentSubmit?.(expandedPost, commentText);
  };

  // Delete comment
  const handleCommentDelete = (postId: string, commentId: string) => {
    setComments({
      ...comments,
      [postId]: (comments[postId] || []).filter(c => c.id !== commentId),
    });
  };

  // Click on post toggles expanded
  const handlePostClick = (postId: string) => {
    setExpandedPost(prev => prev === postId ? null : postId);
    onExpandedPostChange?.(expandedPost === postId ? null : postId);
  };

  // View business
  const handleBusinessView = (businessId: string) => {
    onBusinessView?.(businessId);
  };

  // Vote on post
  const handlePostVote = (postId: string, voteType: 'up' | 'down') => {
    onPostVote?.(postId, voteType);
  };

  // Delete post
  const handlePostDelete = (postId: string) => {
    onPostDelete?.(postId);
  };

  // Filter posts
  const displayPosts = useMemo(() => {
    return filteredBusinessId
      ? posts.filter(post => post.businessId === filteredBusinessId && !post.isJobUpdate)
      : filteredUserStories
        ? posts.filter(post => post.author === 'You' && !post.isJobUpdate)
        : posts;
  }, [posts, filteredBusinessId, filteredUserStories]);

  // Close expanded post if clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".post-container")) {
        setExpandedPost(null);
        onExpandedPostChange?.(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onExpandedPostChange]);

  return (
    <div className="relative w-full h-full">
      <div className={`h-full overflow-y-auto pb-20 ${filteredBusinessId || filteredUserStories ? 'pt-20' : 'pt-20'}`}>
        <div className="space-y-4 px-4">
          {displayPosts.map(post => {
            const orderedComments = (comments[post.id] || []).slice().sort((a, b) => {
              if (a.author === post.author && b.author !== post.author) return -1;
              if (b.author === post.author && a.author !== post.author) return 1;
              return a.createdAt.getTime() - b.createdAt.getTime();
            });

            return (
              <div key={post.id} className="relative post-container">
                {/* Post container */}
                <div
                  className={`app-popup-transparent p-4 cursor-pointer ${post.images && post.images.length >= 5 ? 'relative overflow-hidden' : ''}`}
                  onClick={() => handlePostClick(post.id)}
                  style={{
                    backgroundImage: post.images && post.images.length >= 5 ? `url(${post.images[0]})` : undefined,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center'
                  }}
                >
                  {post.images && post.images.length >= 5 && (
                    <div className="absolute inset-0 opacity-30">
                      <div className="grid grid-cols-3 h-full">
                        {post.images.slice(0, 6).map((img, idx) => (
                          <div key={idx} className="bg-cover bg-center" style={{ backgroundImage: `url(${img})` }} />
                        ))}
                      </div>
                    </div>
                  )}

                  <div className={`relative z-10 pb-10 ${post.images && post.images.length >= 5 ? 'post-overlay rounded-lg p-3' : ''}`}>
                    <div className="flex items-start justify-between mb-2">
                      <TranslatedText
                        text={post.text}
                        className="text-app-black flex-1 pr-4 break-words overflow-wrap-break-word"
                      />
                      <div className="flex-shrink-0 w-8 flex justify-center mt-1 my-0">
                        {(post.businessId || post.isJobUpdate) && (
                          <button onClick={e => {
                            e.stopPropagation();
                            if (post.businessId) {
                              handleBusinessView(post.businessId);
                            } else if (post.linkedLocation) {
                              toast({ title: "Location", description: post.linkedLocation });
                            }
                          }} className="flex items-center space-x-1 text-app-gray-medium hover:text-app-black">
                            <span className="py-0 my-0">👀</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Timestamp */}
                    <div className="absolute bottom-1 left-1">
                      <span className="text-xs text-gray-400">{formatTimeAgo(post.createdAt)}</span>
                    </div>

                    {/* Post voting */}
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
                  </div>

                  {/* Expanded comment section */}
                  {expandedPost === post.id && (
                    <div className="mt-4 pt-4 border-t border-app-gray-light space-y-2">
                      {orderedComments.length === 0 ? (
                        <h4 className="text-sm font-medium mb-2 text-slate-500 text-left">
                          Be the first to share! 😉
                        </h4>
                      ) : (
                        orderedComments.map(comment => (
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
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Input bar */}
      <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-20">
        {expandedPost ? (
          <div className="relative">
            <input
              type="text"
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              placeholder="Leave a comment!"
              className="search-bar pr-14"
              onKeyPress={e => { if (e.key === 'Enter') handleCommentSubmit(); }}
            />
            <button onClick={handleCommentSubmit} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-lg bg-transparent">🗣️</button>
          </div>
        ) : (
          <div className="relative">
            <input
              type="text"
              value={postText}
              onChange={e => setPostText(e.target.value)}
              placeholder={filteredBusinessId ? "Thoughts about this business?" : "How's work?"}
              className="search-bar pr-14"
              onKeyPress={e => { if (e.key === 'Enter') handlePostSubmit(); }}
            />
            <button onClick={handlePostSubmit} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-lg bg-transparent">🗣️</button>
          </div>
        )}
      </div>
    </div>
  );
});

export default ExplorePage;