import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from "@/integrations/supabase/client";

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
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx?.fillText('device-fingerprint', 2, 2);
  const canvasFingerprint = canvas.toDataURL();
  
  const screen = `${window.screen.width}x${window.screen.height}`;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const language = navigator.language;
  const userAgent = navigator.userAgent;
  
  const fingerprint = btoa(`${canvasFingerprint}-${screen}-${timezone}-${language}-${userAgent}`);
  
  return `device_${fingerprint.substring(0, 40)}`;
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
        
        let storedDeviceId = localStorage.getItem('device_id');
        
        if (storedDeviceId && storedDeviceId.split('_').length > 2) {
          console.log('Clearing old device ID format:', storedDeviceId);
          localStorage.removeItem('device_id');
          storedDeviceId = null;
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
                is_authenticated: false
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