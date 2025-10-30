import React from 'react';

interface CommenterBadgeProps {
  label: string;  // Either emoji or "OP"
  color: string;
  isOP: boolean;
}

export const CommenterBadge: React.FC<CommenterBadgeProps> = ({ label, color, isOP }) => {
  return (
    <div
      className="flex items-center justify-center flex-shrink-0"
      style={{
        width: '28px',  // Fixed width for alignment
        height: '28px',
        borderRadius: '50%',
        backgroundColor: `${color}80`, // 50% opacity (80 in hex)
        fontSize: isOP ? '10px' : '14px',
        fontWeight: isOP ? 'bold' : 'normal',
      }}
    >
      {label}
    </div>
  );
};
