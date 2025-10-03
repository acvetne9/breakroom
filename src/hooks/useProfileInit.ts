import { useEffect } from 'react';
import { getUserProfile } from '@/services/posts';

/**
 * Hook to ensure user profile is created on app mount
 * This runs immediately when the app loads to guarantee profile existence
 */
export const useProfileInit = () => {
  useEffect(() => {
    const initProfile = async () => {
      try {
        console.log('Initializing profile...');
        const profileId = await getUserProfile();
        console.log('Profile initialized:', profileId);
      } catch (error) {
        console.error('Error initializing profile:', error);
      }
    };

    initProfile();
  }, []);
};
