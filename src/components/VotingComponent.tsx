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

  useEffect(() => {
    if (!showDeleteConfirm || !deleteButtonRef.current) return;
  
    const margin = 8; // viewport padding
    const rect = deleteButtonRef.current.getBoundingClientRect();
  
    const top = rect.bottom + margin;                // below button
    const left = rect.right + margin;                // start to the right of button
    const maxWidthToRight = Math.max(0, window.innerWidth - left - margin);
  
    // If there's space to the right of the button, use it.
    // Otherwise, fall back to aligning with the viewport's right edge.
    if (maxWidthToRight >= 1) {
      setPopupStyle({
        position: "fixed",
        top,
        left,
        maxWidth: maxWidthToRight, // prevents right overflow
        zIndex: 999999,
      });
    } else {
      setPopupStyle({
        position: "fixed",
        top,
        right: margin, // stick to viewport right safely
        left: "auto",
        maxWidth: window.innerWidth - margin * 2,
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
            className="bg-white rounded-xl border-2 border-yellow-400 shadow-lg p-4 inline-block whitespace-normal break-words"
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