import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface VotingComponentProps { upvotes: number; downvotes: number; userVote?: 'up' | 'down' | null; onVote: (voteType: 'up' | 'down') => void; className?: string; isOwner?: boolean; onDelete?: () => void; }

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
  const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({});
  const deleteButtonRef = useRef<HTMLButtonElement | null>(null);

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

  // Measure button position to anchor popup
  useEffect(() => {
    if (showDeleteConfirm && deleteButtonRef.current) {
      const rect = deleteButtonRef.current.getBoundingClientRect();
      const margin = 8;
      const maxWidth = window.innerWidth - margin * 2;
  
      setPopupStyle({
        position: "absolute",
        top: rect.bottom + window.scrollY + margin, // 8px gap below button
        // Align to the right edge of the button, but keep inside viewport
        left: Math.max(
          margin,
          rect.right + window.scrollX - maxWidth
        ),
        maxWidth: maxWidth,
        zIndex: 999999,
      });
    }
  }, [showDeleteConfirm]);

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
            ref={deleteButtonRef}
            onClick={handleDelete}
            className="p-1 rounded transition-all hover:bg-red-50 hover:scale-105"
          >
            <span className="transition-all">🗑️</span>
          </button>
        </div>
      )}

      {showDeleteConfirm &&
        createPortal(
          <div
            style={popupStyle}
            className="bg-white rounded-xl border-2 border-yellow-400 shadow-lg p-4 inline-block w-auto break-words"
          >
            <p className="text-sm text-gray-800">
              Are you sure you want to delete this post?
            </p>
          </div>,
          document.body
        )}

    </div>
  );
};

export default VotingComponent;