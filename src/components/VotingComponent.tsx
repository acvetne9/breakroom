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

  const margin = 8; // vertical gap
  const rect = deleteButtonRef.current.getBoundingClientRect();

  // Position below the button
  let top = rect.bottom + window.scrollY + margin;

  // Start with the popup aligned to the button’s right edge
  let left = rect.right + window.scrollX;

  // Apply your requested 5% shift left
  const shiftLeft = window.innerWidth * 0.05;
  left = left - shiftLeft;

  // Measure max available width
  const maxWidth = window.innerWidth - 2 * margin;

  setPopupStyle({
    position: "absolute",
    top,
    left: Math.max(margin, Math.min(left, window.innerWidth - margin)), // clamp so it stays in viewport
    maxWidth,
    whiteSpace: "normal", // wrap text
    zIndex: 999999,
  });
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
      className="bg-white rounded-xl border-2 border-yellow-400 shadow-lg p-4 inline-block break-words w-auto"
    >
      <p className="text-sm text-gray-800 text-center">
        Are you sure you want to delete this post?
      </p>
    </div>,
    document.body
  )}


    </div>
  );
};

export default VotingComponent;