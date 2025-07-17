import React, { useState, useRef } from 'react';
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
}

const MobileApp: React.FC = () => {
  const [currentView, setCurrentView] = useState<'initiation' | 'main'>('initiation');
  const [currentSlide, setCurrentSlide] = useState(1); // 0: Settings, 1: Home, 2: Explore
  const [userData, setUserData] = useState<UserData | null>(null);
  const constraintsRef = useRef(null);
  const { businesses, loading } = useBusinessesData();

  const posts = [
    {
      id: '1',
      author: 'BaristaBoss',
      text: 'Guess what!! I never thought this would happen but my boss brought in donuts today!',
      businessId: '1',
      businessName: 'Cafe Priyanka',
      images: Array(6).fill('https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=300&h=200&fit=crop')
    },
    {
      id: '2',
      author: 'Cook52345234',
      text: 'My old manager would always refuse to approve my sick leave :(',
      businessId: '1',
      businessName: 'Cafe Priyanka'
    }
  ];

  const handleInitiationComplete = (data: UserData) => {
    setUserData(data);
    setCurrentView('main');
  };

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

  if (currentView === 'initiation') {
    return <InitiationPage onComplete={handleInitiationComplete} />;
  }

  return (
    <div className="fixed inset-0 overflow-hidden">
      {/* Map is always the background */}
      <HomePage businesses={businesses} />
      
      {/* Settings Card - slides from left */}
      {currentSlide === 0 && userData && (
        <motion.div
          initial={{ x: '-100%' }}
          animate={{ x: 0 }}
          exit={{ x: '-100%' }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="absolute inset-0 z-20"
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
        >
          <ExplorePage 
            posts={posts}
            onBusinessView={(businessId) => {
              // TODO: Filter explore to show posts for this business
              console.log('View business:', businessId);
            }}
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