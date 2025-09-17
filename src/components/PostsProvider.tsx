import React, { createContext, useContext } from 'react';
import { usePosts } from '@/hooks/usePosts';

const PostsContext = createContext<ReturnType<typeof usePosts> | null>(null);

export const PostsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const postsValue = usePosts();
  
  return (
    <PostsContext.Provider value={postsValue}>
      {children}
    </PostsContext.Provider>
  );
};

export const usePostsContext = () => {
  const context = useContext(PostsContext);
  if (!context) {
    throw new Error('usePostsContext must be used within a PostsProvider');
  }
  return context;
};