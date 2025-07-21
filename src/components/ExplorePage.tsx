import React, { useState } from 'react';
import { Eye } from 'lucide-react';
import { Input } from './ui/input';
import { Button } from './ui/button';
interface Post {
  id: string;
  author: string;
  text: string;
  businessId?: string;
  businessName?: string;
  images?: string[];
}
interface ExplorePageProps {
  posts: Post[];
  onBusinessView?: (businessId: string) => void;
  onExpandedPostChange?: (postId: string | null) => void;
  onCommentSubmit?: (postId: string, comment: string) => void;
}
const ExplorePage: React.FC<ExplorePageProps> = ({
  posts,
  onBusinessView,
  onExpandedPostChange,
  onCommentSubmit
}) => {
  const [newPostText, setNewPostText] = useState('');
  const [expandedPost, setExpandedPost] = useState<string | null>(null);
  const [comments, setComments] = useState<{
    [postId: string]: string[];
  }>({});
  const [newComment, setNewComment] = useState('');
  const handlePostSubmit = () => {
    if (newPostText.trim()) {
      // TODO: Submit new post to posts array
      console.log('New post:', newPostText);
      setNewPostText('');
    }
  };
  const handleCommentSubmit = (postId: string, comment?: string) => {
    const commentText = comment || newComment;
    if (commentText.trim()) {
      setComments({
        ...comments,
        [postId]: [...(comments[postId] || []), commentText]
      });
      setNewComment('');
      onCommentSubmit?.(postId, commentText);
    }
  };
  const handlePostClick = (postId: string) => {
    const newExpandedPost = expandedPost === postId ? null : postId;
    setExpandedPost(newExpandedPost);
    onExpandedPostChange?.(newExpandedPost);
  };
  const handleBusinessView = (businessId: string) => {
    onBusinessView?.(businessId);
  };
  return <div className="relative w-full h-full">
      {/* New Post Input - Fixed at top */}
      <div className="fixed top-4 left-4 right-4 z-50 bg-background/95 backdrop-blur-sm border rounded-lg p-3 shadow-lg">
        <div className="flex gap-2">
          <Input
            placeholder="What's happening at work?"
            value={newPostText}
            onChange={(e) => setNewPostText(e.target.value)}
            className="flex-1"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handlePostSubmit();
              }
            }}
          />
          <Button onClick={handlePostSubmit} disabled={!newPostText.trim()}>
            Post
          </Button>
        </div>
      </div>

      {/* Posts list */}
      <div className="h-full overflow-y-auto pb-20 pt-20">
        <div className="space-y-4 px-4">
          {posts.map(post => <div key={post.id} className="relative">
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
                    {post.businessId && <button onClick={e => {
                  e.stopPropagation();
                  handleBusinessView(post.businessId!);
                }} className="flex items-center space-x-1 text-app-gray-medium hover:text-app-black">
                        <span>👀</span>{/* <Eye className="w-4 h-4" /> */}
                      </button>}
                  </div>
                  <p className="text-app-black">{post.text}</p>
                </div>

                {/* Expanded view */}
                {expandedPost === post.id && <div className="mt-4 pt-4 border-t border-app-gray-light">
                    {(!comments[post.id] || comments[post.id].length === 0) && (
                      <h4 className="text-sm font-medium mb-2 text-slate-500 text-left">Be the first to share! 😉</h4>
                    )}
                    <div className="space-y-2 mb-3">
                      {(comments[post.id] || []).map((comment, idx) => <p key={idx} className="text-sm text-app-gray-dark">
                          {comment}
                        </p>)}
                    </div>
                    
                    {/* Comment Input */}
                    <div className="flex gap-2 mt-3">
                      <Input
                        placeholder="Write a comment..."
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        className="flex-1"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleCommentSubmit(post.id);
                          }
                        }}
                      />
                      <Button 
                        onClick={() => handleCommentSubmit(post.id)} 
                        disabled={!newComment.trim()}
                        size="sm"
                      >
                        Reply
                      </Button>
                    </div>
                  </div>}
              </div>
            </div>)}
        </div>
      </div>

    </div>;
};
export default ExplorePage;