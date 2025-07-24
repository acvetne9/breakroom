
import React, { useState, useRef, useEffect } from 'react';
import { motion, PanInfo } from 'framer-motion';
import InitiationPage from './InitiationPage';
import HomePage from './HomePage';
import SettingsPage from './SettingsPage';
import ExplorePage from './ExplorePage';
import { useBusinessesData } from '../hooks/useBusinessesData';

interface UserData {
  salary: string;
  role: string;
  location: string;
  fullLocation?: string;
}

interface Post {
  id: string;
  author: string;
  text: string;
  businessId?: string;
  businessName?: string;
  images?: string[];
  isStory?: boolean;
}

const MobileApp: React.FC = () => {
  const [currentView, setCurrentView] = useState<'initiation' | 'main'>('initiation');
  const [currentSlide, setCurrentSlide] = useState(1); // 0: Settings, 1: Home, 2: Explore
  const [userData, setUserData] = useState<UserData | null>(null);
  const [expandedPost, setExpandedPost] = useState<string | null>(null);
  const [comments, setComments] = useState<{[postId: string]: string[]}>({});
  const [selectedBusiness, setSelectedBusiness] = useState<any>(null);
  const [previouslySelectedBusiness, setPreviouslySelectedBusiness] = useState<any>(null);
  const [filteredBusinessId, setFilteredBusinessId] = useState<string | null>(null);
  const constraintsRef = useRef(null);
  const { businesses, loading } = useBusinessesData();

  const [posts, setPosts] = useState<Post[]>([
    {
      id: '1',
      author: 'BaristaBoss',
      text: 'Guess what!! I never thought this would happen but my boss brought in donuts today!',
      businessId: '1',
      businessName: 'Cafe Priyanka',
      images: Array(6).fill('https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=300&h=200&fit=crop'),
      isStory: true
    },
    {
      id: '2',
      author: 'Cook52345234',
      text: 'My old manager would always refuse to approve my sick leave :(',
      businessId: '1',
      businessName: 'Cafe Priyanka',
      isStory: true
    }
  ]);

  const handleInitiationComplete = (data: UserData) => {
    setUserData(data);
    setCurrentView('main');
  };

  const handlePostSubmit = (text: string, businessId?: string) => {
    const business = businessId ? businesses.find(b => b.id === businessId) : undefined;
    
    // Determine if this should be a story
    const businessPosts = posts.filter(p => p.businessId === businessId && p.isStory);
    const shouldBeStory = businessId && businessPosts.length < 5;
    
    const newPost: Post = {
      id: String(posts.length + 1),
      author: 'You',
      text,
      businessId,
      businessName: business?.name,
      isStory: shouldBeStory
    };
    setPosts([newPost, ...posts]);
  };

  const handleBusinessClick = (business: any) => {
    setSelectedBusiness(business);
  };

  const handleBusinessStoriesClick = (businessId: string) => {
    setFilteredBusinessId(businessId);
    setCurrentSlide(2); // Navigate to explore page
  };

  const handleBackToAllPosts = () => {
    setFilteredBusinessId(null);
  };

  // Handle business state when sliding to explore and back
  useEffect(() => {
    if (currentSlide === 2) {
      // Going to explore page - save current business and close it
      if (selectedBusiness) {
        setPreviouslySelectedBusiness(selectedBusiness);
        setSelectedBusiness(null);
      }
    } else if (currentSlide === 1 && previouslySelectedBusiness) {
      // Coming back to home page - restore previously selected business
      setSelectedBusiness(previouslySelectedBusiness);
      setPreviouslySelectedBusiness(null);
    }
  }, [currentSlide, selectedBusiness, previouslySelectedBusiness]);

  const handleDragEnd = (event: any, info: PanInfo) => {
    const threshold = 100;
    const dragStartX = event.clientX || event.touches?.[0]?.clientX || 0;
    const screenWidth = window.innerWidth;
    const edgeThreshold = 50; // Only allow swiping within 50px of screen edges
    
    // Only allow swiping if drag started near screen edges
    const isNearLeftEdge = dragStartX < edgeThreshold;
    const isNearRightEdge = dragStartX > screenWidth - edgeThreshold;
    
    if ((isNearLeftEdge || isNearRightEdge)) {
      if (info.offset.x > threshold && currentSlide > 0) {
        setCurrentSlide(currentSlide - 1);
      } else if (info.offset.x < -threshold && currentSlide < 2) {
        setCurrentSlide(currentSlide + 1);
      }
    }
  };

  return (
    <div className="fixed inset-0 overflow-hidden">
      {/* Map is always the background */}
      <HomePage 
        businesses={businesses} 
        currentSlide={currentSlide}
        selectedBusiness={selectedBusiness}
        onBusinessSelect={handleBusinessClick}
        posts={posts}
        onBusinessStoriesClick={handleBusinessStoriesClick}
      />
      
      {/* Initiation Card - slides up and disappears */}
      {currentView === 'initiation' && (
        <InitiationPage onComplete={handleInitiationComplete} />
      )}
      
      {/* Settings Card - slides from left */}
      {currentSlide === 0 && userData && (
        <motion.div
          initial={{ x: '-100%' }}
          animate={{ x: 0 }}
          exit={{ x: '-100%' }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="absolute inset-0 z-20"
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.1}
          onDragEnd={(event, info) => {
            if (info.offset.x < -100) {
              setCurrentSlide(1);
            }
          }}
        >
          <SettingsPage initialData={userData} />
        </motion.div>
      )}

      {/* Explore Card - slides from right */}
      {currentSlide === 2 && (
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="absolute inset-0 z-20"
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.1}
          onDragEnd={(event, info) => {
            if (info.offset.x > 100) {
              setCurrentSlide(1);
            }
          }}
        >
          <ExplorePage 
            posts={posts}
            filteredBusinessId={filteredBusinessId || undefined}
            onBusinessView={handleBusinessClick}
            onExpandedPostChange={(postId) => {
              setExpandedPost(postId);
            }}
            onCommentSubmit={(postId, comment) => {
              setComments({
                ...comments,
                [postId]: [...(comments[postId] || []), comment]
              });
            }}
            onPostSubmit={handlePostSubmit}
            onBackToAllPosts={handleBackToAllPosts}
          />
        </motion.div>
      )}

      {/* Swipe detection overlay - only at screen edges */}
      <div 
        className="absolute inset-0 z-10 pointer-events-none"
      >
        {/* Left edge swipe area */}
        <div 
          className="absolute left-0 top-0 w-12 h-full pointer-events-auto"
          onTouchStart={(e) => {
            if (currentSlide > 0) {
              const touch = e.touches[0];
              const startX = touch.clientX;
              const handleTouchMove = (moveEvent: TouchEvent) => {
                const moveTouch = moveEvent.touches[0];
                const deltaX = moveTouch.clientX - startX;
                if (deltaX > 100) {
                  setCurrentSlide(currentSlide - 1);
                  document.removeEventListener('touchmove', handleTouchMove);
                  document.removeEventListener('touchend', handleTouchEnd);
                }
              };
              const handleTouchEnd = () => {
                document.removeEventListener('touchmove', handleTouchMove);
                document.removeEventListener('touchend', handleTouchEnd);
              };
              document.addEventListener('touchmove', handleTouchMove);
              document.addEventListener('touchend', handleTouchEnd);
            }
          }}
        />
        
        {/* Right edge swipe area */}
        <div 
          className="absolute right-0 top-0 w-12 h-full pointer-events-auto"
          onTouchStart={(e) => {
            if (currentSlide < 2) {
              const touch = e.touches[0];
              const startX = touch.clientX;
              const handleTouchMove = (moveEvent: TouchEvent) => {
                const moveTouch = moveEvent.touches[0];
                const deltaX = startX - moveTouch.clientX;
                if (deltaX > 100) {
                  setCurrentSlide(currentSlide + 1);
                  document.removeEventListener('touchmove', handleTouchMove);
                  document.removeEventListener('touchend', handleTouchEnd);
                }
              };
              const handleTouchEnd = () => {
                document.removeEventListener('touchmove', handleTouchMove);
                document.removeEventListener('touchend', handleTouchEnd);
              };
              document.addEventListener('touchmove', handleTouchMove);
              document.addEventListener('touchend', handleTouchEnd);
            }
          }}
        />
      </div>

      {/* Slide indicators */}
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex space-x-2 z-50">
        {[0, 1, 2].map(index => (
          <button
            key={index}
            onClick={() => setCurrentSlide(index)}
            className={`w-3 h-3 rounded-full transition-colors ${
              index === currentSlide ? 'bg-app-yellow' : 'bg-app-gray-light'
            }`}
          />
        ))}
      </div>
    </div>
  );
};

export default MobileApp;
