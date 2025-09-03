import React, { useState } from 'react';

interface VotingComponentProps {
  upvotes: number;
  downvotes: number;
  userVote?: 'up' | 'down' | null;
  onVote: (voteType: 'up' | 'down') => void;
  className?: string;
  isOwner?: boolean;
  onDelete?: () => void;
}

const VotingComponent: React.FC<VotingComponentProps> = ({
  upvotes,
  downvotes,
  userVote,
  onVote,
  className = "",
  isOwner = false,
  onDelete
}) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  const netScore = upvotes - downvotes;

  const handleUpvote = (e: React.MouseEvent) => {
    e.stopPropagation();
    onVote('up');
  };

  const handleDownvote = (e: React.MouseEvent) => {
    e.stopPropagation();
    onVote('down');
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (showDeleteConfirm) {
      onDelete?.();
      setShowDeleteConfirm(false);
    } else {
      setShowDeleteConfirm(true);
    }
  };

  return (
    <div className={`flex items-center space-x-1 text-sm ${className}`} data-voting-component>
      {!isOwner && (
        <div>
          <button
            onClick={handleUpvote}
            className={`p-1 rounded transition-all ${
              userVote === 'up' 
                ? 'bg-green-100 scale-110' 
                : 'hover:bg-green-50 hover:scale-105'
            }`}
          >
            <span 
              className="transition-all"
              style={{ filter: userVote === 'up' ? 'grayscale(0%)' : 'grayscale(90%)' }}
            >
              ✅
            </span>
          </button>
          
          <span className="font-medium text-app-black min-w-[20px] text-center">
            {netScore}
          </span>
          
          <button
            onClick={handleDownvote}
            className={`p-1 rounded transition-all ${
              userVote === 'down' 
                ? 'bg-red-100 scale-110' 
                : 'hover:bg-red-50 hover:scale-105'
            }`}
          >
            <span 
              className="transition-all"
              style={{ filter: userVote === 'down' ? 'grayscale(0%)' : 'grayscale(90%)' }}
            >
              🚫
            </span>
          </button>
        </div>
      )}
      
      {isOwner && (
        <div className="relative">
          <span className="font-medium text-app-black min-w-[20px] text-center">
            {netScore}
          </span>
        
          <button
            onClick={handleDelete}
            className="p-1 rounded transition-all hover:bg-red-50 hover:scale-105"
          >
            <span className="transition-all">
              🗑️
            </span>
          </button>
          
          {showDeleteConfirm && (
            <div className="absolute top-8 left-0 z-50 bg-white border-2 border-yellow-400 rounded-lg shadow-lg p-3 min-w-[200px]">
              <p className="text-sm text-gray-800">Click the trash can again to delete this post</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default VotingComponent;