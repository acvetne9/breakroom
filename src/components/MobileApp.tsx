import React, { useState, useRef } from 'react';
import { motion, PanInfo } from 'framer-motion';
import InitiationPage from './InitiationPage';
import HomePage from './HomePage';
import SettingsPage from './SettingsPage';
import ExplorePage from './ExplorePage';

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

  // Mock data
  const businesses = [
    {
      id: '1',
      name: 'Cafe Priyanka',
      position: { lat: 40.7831, lng: -73.9712 },
      rating: 5.0,
      salary: '$13.6',
      stories: [
        { id: '1', text: 'Great place to work, flexible hours', author: 'Sarah123' },
        { id: '2', text: 'Management is really supportive', author: 'Mike_B' }
      ],
      roles: [
        { role: 'Barista', salary: '$13.6' },
        { role: 'Manager', salary: '$18.5' }
      ]
    },
    {
      id: '2',
      name: 'Taco Bell',
      position: { lat: 40.7841, lng: -73.9702 },
      rating: 4.2,
      salary: '$15.0',
      stories: [
        { id: '3', text: 'Fast-paced environment, good for building skills', author: 'JobSeeker' }
      ]
    }
  ];

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
    
    if (info.offset.x > threshold && currentSlide > 0) {
      setCurrentSlide(currentSlide - 1);
    } else if (info.offset.x < -threshold && currentSlide < 2) {
      setCurrentSlide(currentSlide + 1);
    }
  };

  if (currentView === 'initiation') {
    return <InitiationPage onComplete={handleInitiationComplete} />;
  }

  return (
    <div className="fixed inset-0 overflow-hidden bg-white">
      <div ref={constraintsRef} className="w-full h-full relative">
        <motion.div
          className="flex w-[300vw] h-full"
          animate={{ x: `${-currentSlide * 100}vw` }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          drag="x"
          dragConstraints={constraintsRef}
          dragElastic={0.1}
          onDragEnd={handleDragEnd}
        >
          {/* Settings Page */}
          <div className="w-screen h-full relative">
            <HomePage businesses={businesses} />
            <div className="absolute inset-0 bg-white bg-opacity-95 z-10">
              {userData && <SettingsPage initialData={userData} />}
            </div>
          </div>

          {/* Home Page */}
          <div className="w-screen h-full">
            <HomePage businesses={businesses} />
          </div>

          {/* Explore Page */}
          <div className="w-screen h-full relative">
            <HomePage businesses={businesses} />
            <div className="absolute inset-0 bg-white bg-opacity-95 z-10">
              <ExplorePage 
                posts={posts}
                onBusinessView={(businessId) => {
                  // TODO: Filter explore to show posts for this business
                  console.log('View business:', businessId);
                }}
              />
            </div>
          </div>
        </motion.div>

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
    </div>
  );
};

export default MobileApp;