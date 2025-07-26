import React from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface VotingComponentProps {
  upvotes: number;
  downvotes: number;
  userVote?: 'up' | 'down' | null;
  onVote: (voteType: 'up' | 'down') => void;
  className?: string;
}

const VotingComponent: React.FC<VotingComponentProps> = ({
  upvotes,
  downvotes,
  userVote,
  onVote,
  className = ""
}) => {
  const netScore = upvotes - downvotes;

  const handleUpvote = (e: React.MouseEvent) => {
    e.stopPropagation();
    onVote('up');
  };

  const handleDownvote = (e: React.MouseEvent) => {
    e.stopPropagation();
    onVote('down');
  };

  return (
    <div className={`flex items-center space-x-1 text-sm ${className}`} data-voting-component>
      <button
        onClick={handleUpvote}
        className={`p-1 rounded transition-all ${
          userVote === 'up' 
            ? 'bg-green-100 scale-110' 
            : 'hover:bg-green-50 hover:scale-105'
        }`}
      >
        <ChevronUp 
          size={16} 
          className={userVote === 'up' ? 'text-green-600' : 'text-gray-400'} 
        />
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
        <ChevronDown 
          size={16} 
          className={userVote === 'down' ? 'text-red-600' : 'text-gray-400'} 
        />
      </button>
    </div>
  );
};

export default VotingComponent;