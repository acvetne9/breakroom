import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

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
  const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({});
  const deleteButtonRef = useRef<HTMLButtonElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);

  const netScore = upvotes - downvotes;

  const handleUpvote = (e: React.MouseEvent) => {
    e.stopPropagation();
    onVote('up');
  };

  const handleDownvote = (e: React.MouseEvent) => {
    e.stopPropagation();
    onVote('down');
  };

  // Toggle: first click -> open (measure & position), second click -> confirm delete
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (showDeleteConfirm) {
      onDelete?.();
      setShowDeleteConfirm(false);
    } else {
      // Show popup in an off-screen/hidden state so we can render and measure its natural size
      setPopupStyle({
        position: 'absolute',
        left: -9999,
        top: -9999,
        visibility: 'hidden',
      });
      setShowDeleteConfirm(true);
    }
  };

    // Close popup if clicking outside
  useEffect(() => {
    if (!showDeleteConfirm) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popupRef.current &&
        !popupRef.current.contains(target) &&
        deleteButtonRef.current &&
        !deleteButtonRef.current.contains(target)
      ) {
        setShowDeleteConfirm(false);
      }
    };

    document.addEventListener("click", handleClickOutside);
    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, [showDeleteConfirm]);

  // Measure & position synchronously after DOM writes (pre-paint)
  useLayoutEffect(() => {
    if (!showDeleteConfirm) return;
    if (!deleteButtonRef.current || !popupRef.current) return;

    const margin = 8; // safe padding from viewport edges
    const buttonRect = deleteButtonRef.current.getBoundingClientRect();
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;
    const maxAllowedWidth = Math.max(0, window.innerWidth - margin * 2);

    const popupEl = popupRef.current;
    const popupRect = popupEl.getBoundingClientRect();

    // PHASE 1: if the popup's natural width is bigger than viewport, set width -> maxAllowedWidth and re-run.
    // We rely on useLayoutEffect re-running after setPopupStyle changes popupStyle.width.
    if (popupRect.width > maxAllowedWidth && popupStyle.width !== `${maxAllowedWidth}px`) {
      setPopupStyle(prev => ({
        ...prev,
        width: `${maxAllowedWidth}px`,
        position: 'absolute',
        left: -9999,
        top: -9999,
        visibility: 'hidden',
      }));
      return; // wait for reflow with new width then re-measure
    }

    // PHASE 2: compute right-aligned placement
    // Desired right edge (viewport coordinates) is the button's right, but clamp to viewport right margin
    const viewportRightLimit = window.innerWidth - margin;
    const buttonRight = Math.min(buttonRect.right, viewportRightLimit);

    // left coordinate in document coordinates:
    let left = buttonRight + scrollX - popupRect.width;

    // Ensure not offscreen to the left (clamp)
    const minLeft = margin + scrollX;
    if (left < minLeft) left = minLeft;

    // If it still overflows right for any reason, clamp left so popup fits
    if (left + popupRect.width > window.innerWidth + scrollX - margin) {
      left = window.innerWidth + scrollX - margin - popupRect.width;
      if (left < minLeft) left = minLeft;
    }

    const top = buttonRect.bottom + scrollY + margin;

    // Final visible style
    setPopupStyle({
      position: 'absolute',
      top,
      left,
      width: popupRect.width ? `${popupRect.width}px` : undefined, // set measured width for stability
      visibility: 'visible',
      zIndex: 999999,
    });
    // dependencies: include popupStyle.width so phase-1 triggers re-run when we set width
  }, [showDeleteConfirm, popupStyle.width]);

  // Keep popup positioned if user resizes / rotates / scrolls while open
  useEffect(() => {
    if (!showDeleteConfirm) return;
    const onChange = () => {
      // Re-open measurement: hide, then measurement hook will run and compute again
      setPopupStyle({
        position: 'absolute',
        left: -9999,
        top: -9999,
        visibility: 'hidden',
      });
    };
    window.addEventListener('resize', onChange);
    window.addEventListener('orientationchange', onChange);
    window.addEventListener('scroll', onChange, { passive: true });

    return () => {
      window.removeEventListener('resize', onChange);
      window.removeEventListener('orientationchange', onChange);
      window.removeEventListener('scroll', onChange);
    };
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
            ref={popupRef}
            style={popupStyle}
            className="bg-white rounded-xl border-2 border-yellow-400 shadow-lg p-4 break-words inline-block whitespace-normal"
          >
            <p className="text-sm text-gray-800 text-center">
              Are you sure you want to delete this?
            </p>
          </div>,
          document.body
        )}
    </div>
  );
};

export default VotingComponent;
