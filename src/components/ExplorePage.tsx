import React, { useState } from 'react';
import { Eye } from 'lucide-react';
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
      {/* New post input */}
      <div className="p-4 border-b border-app-gray-light">
        <div className="flex space-x-2">
          <input
            type="text"
            value={newPostText}
            onChange={(e) => setNewPostText(e.target.value)}
            placeholder="What's on your mind?"
            className="flex-1 px-3 py-2 border border-app-gray-light rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            onKeyPress={(e) => e.key === 'Enter' && handlePostSubmit()}
          />
          <button
            onClick={handlePostSubmit}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
          >
            Post
          </button>
        </div>
      </div>

      {/* Posts list */}
      <div className="h-full overflow-y-auto pb-20 pt-4">
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
                     
                     {/* Comment input */}
                     <div className="flex space-x-2">
                       <input
                         type="text"
                         value={newComment}
                         onChange={(e) => setNewComment(e.target.value)}
                         placeholder="Add a comment..."
                         className="flex-1 px-3 py-2 border border-app-gray-light rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                         onKeyPress={(e) => e.key === 'Enter' && handleCommentSubmit(post.id)}
                         onClick={(e) => e.stopPropagation()}
                       />
                       <button
                         onClick={(e) => {
                           e.stopPropagation();
                           handleCommentSubmit(post.id);
                         }}
                         className="px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm"
                       >
                         Reply
                       </button>
                     </div>
                   </div>}
              </div>
            </div>)}
        </div>
      </div>

    </div>;
};
export default ExplorePage;