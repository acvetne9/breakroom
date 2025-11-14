import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from "@/integrations/supabase/client";
import { generateBrowserFingerprint } from "@/utils/browserFingerprint";

interface DeviceContextType {
  deviceId: string;
  loading: boolean;
  isFirstSession: boolean;
}

const DeviceContext = createContext<DeviceContextType | undefined>(undefined);

interface DeviceProviderProps {
  children: ReactNode;
}

function generateDeviceId(): string {
  // Generate a truly unique ID with timestamp and random components
  const timestamp = Date.now();
  const random1 = Math.random().toString(36).substring(2, 15);
  const random2 = Math.random().toString(36).substring(2, 15);
  const random3 = Math.random().toString(36).substring(2, 15);
  
  // Add some browser fingerprint for consistency (but not as the primary uniqueness)
  const screen = `${window.screen.width}x${window.screen.height}`;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  
  return `device_${timestamp}_${random1}${random2}${random3}_${btoa(screen + timezone).substring(0, 10)}`;
}

export function DeviceProvider({ children }: DeviceProviderProps) {
  const [deviceId, setDeviceId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [isFirstSession, setIsFirstSession] = useState(false);

  useEffect(() => {
    const initializeDevice = async () => {
      try {
        const currentSessionId = sessionStorage.getItem('current_session_id');
        const profileCreatedInSession = localStorage.getItem('profile_created_in_session');
        
        let thisSessionId = currentSessionId;
        if (!thisSessionId) {
          thisSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          sessionStorage.setItem('current_session_id', thisSessionId);
        }
        
        if (profileCreatedInSession === thisSessionId) {
          setIsFirstSession(true);
          console.log('Profile was created in this session');
        } else {
          setIsFirstSession(false);
          console.log('Profile was created in a different session (or not at all)');
        }
        
        // Generate browser fingerprint for recovery
        const browserFingerprint = generateBrowserFingerprint();
        console.log('Browser fingerprint:', browserFingerprint);
        
        let storedDeviceId = localStorage.getItem('device_id');
        
        if (storedDeviceId && storedDeviceId.split('_').length < 3) {
          console.log('Clearing old device ID format:', storedDeviceId);
          localStorage.removeItem('device_id');
          storedDeviceId = null;
        }
        
        // If no device_id in localStorage, try to recover from fingerprint
        if (!storedDeviceId) {
          console.log('No device_id in localStorage, attempting fingerprint recovery...');
          
          const { data: existingProfile, error: lookupError } = await supabase
            .from('profiles')
            .select('temp_user_id')
            .eq('browser_fingerprint', browserFingerprint)
            .eq('is_authenticated', false)
            .maybeSingle();
          
          if (lookupError) {
            console.error('Error looking up profile by fingerprint:', lookupError);
          } else if (existingProfile?.temp_user_id) {
            // Recovered device_id from fingerprint!
            storedDeviceId = existingProfile.temp_user_id;
            localStorage.setItem('device_id', storedDeviceId);
            console.log('Recovered device_id from fingerprint:', storedDeviceId);
          }
        }
        
        if (!storedDeviceId) {
          storedDeviceId = generateDeviceId();
          localStorage.setItem('device_id', storedDeviceId);
          console.log('Generated new device ID:', storedDeviceId);
        }
        
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
          const { data: profile, error: selectError } = await supabase
            .from('profiles')
            .select('id')
            .eq('user_id', user.id)
            .maybeSingle();
          
          if (selectError) {
            console.error('Error checking profile:', selectError);
          } else if (!profile) {
            const { error: insertError } = await supabase
              .from('profiles')
              .insert({
                user_id: user.id,
                display_name: user.email?.split('@')[0] || 'User',
                is_authenticated: true
              });
            
            if (insertError && insertError.code !== '23505') {
              console.error('Error creating profile:', insertError);
            } else if (!insertError) {
              localStorage.setItem('profile_created_in_session', thisSessionId);
              setIsFirstSession(true);
              console.log('Created new profile for authenticated user');
            }
          } else if (profile) {
            console.log('Profile already exists for authenticated user');
          }
        } else {
          const { data: profile, error: selectError } = await supabase
            .from('profiles')
            .select('id')
            .eq('temp_user_id', storedDeviceId)
            .maybeSingle();
          
          if (selectError) {
            console.error('Error checking temp profile:', selectError);
          } else if (!profile) {
            const { error: insertError } = await supabase
              .from('profiles')
              .insert({
                user_id: null,
                temp_user_id: storedDeviceId,
                display_name: 'Anonymous User',
                is_authenticated: false,
                browser_fingerprint: browserFingerprint
              });
            
            if (insertError && insertError.code !== '23505') {
              console.error('Error creating temp profile:', insertError);
            } else if (!insertError) {
              localStorage.setItem('profile_created_in_session', thisSessionId);
              setIsFirstSession(true);
              console.log('Created new profile for temp user');
            }
          } else if (profile) {
            console.log('Temp profile already exists');
          }
        }
        
        setDeviceId(storedDeviceId);
      } catch (error) {
        console.error('Fatal error in device initialization:', error);
      } finally {
        setLoading(false);
      }
    };
    
    initializeDevice();
  }, []);

  const value = {
    deviceId,
    loading,
    isFirstSession,
  };

  return <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>;
}

export function useDevice() {
  const context = useContext(DeviceContext);
  if (context === undefined) {
    throw new Error('useDevice must be used within a DeviceProvider');
  }
  return context;
}