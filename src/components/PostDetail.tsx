import React, { useState } from 'react';
import { ArrowLeft, Send } from 'lucide-react';

interface Post {
  id: string;
  author: string;
  text: string;
  businessId?: string;
  businessName?: string;
  images?: string[];
  isStory?: boolean;
}

interface PostDetailProps {
  post: Post;
  comments: string[];
  onClose: () => void;
  onCommentSubmit: (comment: string) => void;
}

const PostDetail: React.FC<PostDetailProps> = ({
  post,
  comments,
  onClose,
  onCommentSubmit
}) => {
  const [commentText, setCommentText] = useState('');

  const handleSubmitComment = () => {
    if (commentText.trim()) {
      onCommentSubmit(commentText.trim());
      setCommentText('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmitComment();
    }
  };

  return (
    <div className="relative w-full h-full flex flex-col">
      <div className="app-card flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-app-gray-light">
          <button 
            onClick={onClose}
            className="flex items-center space-x-2 text-app-gray-medium hover:text-app-black transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Back</span>
          </button>
          <h1 className="text-lg font-medium text-app-black">Post</h1>
          <div className="w-16"></div>
        </div>

        {/* Post Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6">
            {/* Original Post */}
            <div className="mb-6">
              <div className="flex items-start space-x-3 mb-4">
                <div className="w-10 h-10 bg-app-yellow rounded-full flex items-center justify-center">
                  <span className="text-sm font-medium text-app-black">
                    {post.author.substring(0, 2).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-1">
                    <span className="font-medium text-app-black">@{post.author}</span>
                    {post.businessName && (
                      <span className="text-app-gray-medium text-sm">• {post.businessName}</span>
                    )}
                  </div>
                  <p className="text-app-black">{post.text}</p>
                </div>
              </div>
            </div>

            {/* Comments Section */}
            <div className="border-t border-app-gray-light pt-6">
              <h3 className="text-lg font-medium text-app-black mb-4">
                Comments ({comments.length})
              </h3>
              
              {comments.length === 0 ? (
                <p className="text-app-gray-medium text-sm mb-6">
                  No comments yet. Be the first to comment!
                </p>
              ) : (
                <div className="space-y-4 mb-6">
                  {comments.map((comment, index) => (
                    <div key={index} className="flex items-start space-x-3">
                      <div className="w-8 h-8 bg-app-gray-light rounded-full flex items-center justify-center">
                        <span className="text-xs font-medium text-app-gray-medium">YU</span>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-1">
                          <span className="font-medium text-app-black text-sm">@You</span>
                        </div>
                        <p className="text-app-black text-sm">{comment}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Comment Input */}
        <div className="border-t border-app-gray-light p-4">
          <div className="flex items-end space-x-3">
            <div className="flex-1">
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Add a comment..."
                className="app-input resize-none"
                rows={1}
                style={{ minHeight: '48px', maxHeight: '120px' }}
              />
            </div>
            <button
              onClick={handleSubmitComment}
              disabled={!commentText.trim()}
              className={`p-3 rounded-lg transition-colors ${
                commentText.trim() 
                  ? 'bg-app-yellow text-app-black hover:bg-app-yellow/90' 
                  : 'bg-app-gray-light text-app-gray-medium cursor-not-allowed'
              }`}
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PostDetail;