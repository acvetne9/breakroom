import React, { useState, useMemo, memo } from 'react';
import { Eye } from 'lucide-react';
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

  interface Comment {
    id: string;
    author: string;
    text: string;
    createdAt: Date;
  }

  const [comments, setComments] = useState<{ [postId: string]: Comment[] }>({});
  const [postText, setPostText] = useState('');
  const [commentText, setCommentText] = useState('');
  const { toast } = useToast();

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
    if (onPostSubmit) {
      onPostSubmit(postText, filteredBusinessId);
      setPostText('');
    }
  };

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
      author: "You", // replace with logged-in user's name/id
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
    onBusinessView?.(businessId);
  };

  const handlePostVote = (postId: string, voteType: 'up' | 'down') => {
    onPostVote?.(postId, voteType);
  };

  const handlePostDelete = (postId: string) => {
    onPostDelete?.(postId);
  };

  const displayPosts = useMemo(() => {
    let filteredPosts = filteredBusinessId 
      ? posts.filter(post => post.businessId === filteredBusinessId && !post.isJobUpdate)
      : filteredUserStories 
      ? posts.filter(post => post.author === 'You' && !post.isJobUpdate)
      : posts;

    // Add default post when viewing a specific business with no posts
    if (filteredBusinessId && filteredPosts.length === 0) {
      const defaultPost: Post = {
        id: `default-${filteredBusinessId}`,
        author: 'System',
        text: 'Share a thought about this business',
        businessId: filteredBusinessId,
        upvotes: 0,
        downvotes: 0,
        createdAt: new Date()
      };
      filteredPosts = [defaultPost];
    }

    return filteredPosts;
  }, [posts, filteredBusinessId, filteredUserStories]);

  return (
    <div className="relative w-full h-full">
      {/* Header for filtered views */}
      {filteredBusinessId || filteredUserStories}
      
      {/* Posts list */}
      <div className={`h-full overflow-y-auto pb-20 ${filteredBusinessId || filteredUserStories ? 'pt-20' : 'pt-20'}`}>
        <div className="space-y-4 px-4">
          {displayPosts.map(post => (
            <div key={post.id} className="relative">
              {/* Post with background collage if business has 5+ photos */}
              <div
                className={`app-popup-transparent p-4 cursor-pointer ${post.images && post.images.length >= 5 ? 'relative overflow-hidden' : ''} ${post.author === 'System' ? 'border-2 border-app-yellow bg-app-yellow/5' : ''}`}
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
                      text={post.author === 'System' ? '💭 Share a thought about this business' : post.text}
                      className={`flex-1 pr-4 break-words overflow-wrap-break-word text-app-black`}
                    />
                    <div className="flex-shrink-0 w-8 flex justify-center mt-1 my-0">
                      {(post.businessId || post.isJobUpdate) && post.author !== 'System' && (
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            if (post.businessId) {
                              handleBusinessView(post.businessId);
                            } else if (post.linkedLocation) {
                              toast({
                                title: "Location",
                                description: post.linkedLocation
                              });
                            }
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
                      {post.author === 'System' ? 'Start a conversation' : formatTimeAgo(post.createdAt)}
                    </span>
                  </div>
                  
                  {/* Voting component in bottom right - hide for system posts */}
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
              placeholder="Leave a comment!"
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
              placeholder={filteredBusinessId ? "Thoughts about this business?" : "How's work?"}
              className="search-bar pr-14"
              onKeyPress={e => {
                if (e.key === 'Enter') {
                  handlePostSubmit();
                }
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
});

export default ExplorePage;