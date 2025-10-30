import React from 'react';
import * as Icons from 'lucide-react';

interface CommenterBadgeProps {
  iconName: string;  // Either Lucide icon name or "OP"
  color: string;
  isOP: boolean;
}

export const CommenterBadge: React.FC<CommenterBadgeProps> = ({ iconName, color, isOP }) => {
  const Icon = isOP ? null : Icons[iconName as keyof typeof Icons] as React.ComponentType<{ size?: number; strokeWidth?: number }>;
  
  return (
    <div
      className="flex items-center justify-center flex-shrink-0"
      style={{
        width: '28px',  // Fixed width for alignment
        height: '28px',
        borderRadius: '50%',
        backgroundColor: `${color}80`, // 50% opacity (80 in hex)
      }}
    >
      {isOP ? (
        <span className="text-[10px] font-bold">OP</span>
      ) : (
        Icon && <Icon size={16} strokeWidth={2} />
      )}
    </div>
  );
};
