import React, { useState } from 'react';
import { Eye } from 'lucide-react';
import { isProfane } from '../utils/profanityFilter';
import { useToast } from '@/hooks/use-toast';
interface Post {
  id: string;
  author: string;
  text: string;
  businessId?: string;
  businessName?: string;
  images?: string[];
  isStory?: boolean;
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
}
const ExplorePage: React.FC<ExplorePageProps> = ({
  posts,
  filteredBusinessId,
  filteredUserStories = false,
  onBusinessView,
  onExpandedPostChange,
  onCommentSubmit,
  onPostSubmit,
  onBackToAllPosts
}) => {
  const [expandedPost, setExpandedPost] = useState<string | null>(null);
  const [comments, setComments] = useState<{
    [postId: string]: string[];
  }>({});
  const [postText, setPostText] = useState('');
  const [commentText, setCommentText] = useState('');
  const {
    toast
  } = useToast();
  const handlePostSubmit = () => {
    if (!postText.trim()) return;

    // Check for profanity
    if (isProfane(postText)) {
      toast({
        title: "Post blocked",
        description: "Inappropriate content detected",
        variant: "destructive"
      });
      setPostText(''); // Clear the input
      return;
    }
    if (onPostSubmit) {
      onPostSubmit(postText, filteredBusinessId);
      setPostText('');
    }
  };
  const handleCommentSubmit = () => {
    if (!commentText.trim() || !expandedPost) return;

    // Check for profanity
    if (isProfane(commentText)) {
      toast({
        title: "Comment blocked",
        description: "Inappropriate content detected",
        variant: "destructive"
      });
      setCommentText(''); // Clear the input
      return;
    }
    setComments({
      ...comments,
      [expandedPost]: [...(comments[expandedPost] || []), commentText]
    });
    setCommentText('');
    onCommentSubmit?.(expandedPost, commentText);
  };
  const handlePostClick = (postId: string) => {
    const newExpandedPost = expandedPost === postId ? null : postId;
    setExpandedPost(newExpandedPost);
    onExpandedPostChange?.(newExpandedPost);
  };
  const handleBusinessView = (businessId: string) => {
    onBusinessView?.(businessId);
  };

  // Filter posts based on business or user stories
  const displayPosts = filteredBusinessId ? posts.filter(post => post.businessId === filteredBusinessId) : filteredUserStories ? posts.filter(post => post.author === 'You') : posts;
  return <div className="relative w-full h-full">
      {/* Header for filtered views */}
      {filteredBusinessId || filteredUserStories}
      
      {/* Posts list */}
      <div className={`h-full overflow-y-auto pb-20 ${filteredBusinessId || filteredUserStories ? 'pt-20' : 'pt-4'}`}>
        <div className="space-y-4 px-4">
          {displayPosts.map(post => <div key={post.id} className="relative">
              {/* Post with background collage if business has 5+ photos */}
              <div className={`app-popup p-4 cursor-pointer ${post.images && post.images.length >= 5 ? 'relative overflow-hidden' : ''}`} onClick={() => handlePostClick(post.id)} style={{
            backgroundImage: post.images && post.images.length >= 5 ? `url(${post.images[0]})` : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}>
                {/* Background collage overlay */}
                {post.images && post.images.length >= 5 && <div className="absolute inset-0 opacity-30">
                    <div className="grid grid-cols-3 h-full">
                      {post.images.slice(0, 6).map((img, idx) => <div key={idx} className="bg-cover bg-center" style={{
                  backgroundImage: `url(${img})`
                }} />)}
                    </div>
                  </div>}

                {/* Post content */}
                <div className={`relative z-10 ${post.images && post.images.length >= 5 ? 'post-overlay rounded-lg p-3' : ''}`}>
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-app-gray-medium text-sm">@{post.author}</span>
                    {post.businessId ? <button onClick={e => {
                  e.stopPropagation();
                  handleBusinessView(post.businessId!);
                }} className="flex items-center space-x-1 text-app-gray-medium hover:text-app-black">
                        <span>👀</span>
                      </button> : null}
                  </div>
                  <p className="text-app-black">{post.text}</p>
                </div>

                {/* Expanded view */}
                {expandedPost === post.id && <div className="mt-4 pt-4 border-t border-app-gray-light">
                    {(!comments[post.id] || comments[post.id].length === 0) && <h4 className="text-sm font-medium mb-2 text-slate-500 text-left">Be the first to share! 😉</h4>}
                    <div className="space-y-2 mb-3">
                      {(comments[post.id] || []).map((comment, idx) => <p key={idx} className="text-sm text-app-gray-dark">
                          {comment}
                        </p>)}
                    </div>
                  </div>}
              </div>
            </div>)}
        </div>
      </div>

      {/* Input bar at bottom */}
      <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-20">
        {expandedPost ?
      // Comment input when post is expanded
      <div className="relative">
            <input type="text" value={commentText} onChange={e => setCommentText(e.target.value)} placeholder="Leave a comment!" className="search-bar pr-14" onKeyPress={e => {
          if (e.key === 'Enter') {
            handleCommentSubmit();
          }
        }} />
            <button onClick={handleCommentSubmit} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-lg bg-transparent">
              🗣️
            </button>
          </div> :
      // Post input for explore page
      <div className="relative">
            <input type="text" value={postText} onChange={e => setPostText(e.target.value)} placeholder="How's work?" className="search-bar pr-14" onKeyPress={e => {
          if (e.key === 'Enter') {
            handlePostSubmit();
          }
        }} />
            <button onClick={handlePostSubmit} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-lg bg-transparent">
              🗣️
            </button>
          </div>}
      </div>
    </div>;
};
export default ExplorePage;