import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from "@/integrations/supabase/client";

interface DeviceContextType {
  deviceId: string;
  loading: boolean;
  profileWasCreated: boolean;
}

const DeviceContext = createContext<DeviceContextType | undefined>(undefined);

interface DeviceProviderProps {
  children: ReactNode;
}

function generateDeviceId(): string {
  // Create a unique device ID based on browser characteristics and random data
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx?.fillText('device-fingerprint', 2, 2);
  const canvasFingerprint = canvas.toDataURL();
  
  const screen = `${window.screen.width}x${window.screen.height}`;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const language = navigator.language;
  const userAgent = navigator.userAgent;
  
  // Combine characteristics - same device = same ID
  const fingerprint = btoa(`${canvasFingerprint}-${screen}-${timezone}-${language}-${userAgent}`);
  
  // No random suffix - ensures consistent device identification
  return `device_${fingerprint.substring(0, 40)}`;
}

export function DeviceProvider({ children }: DeviceProviderProps) {
  const [deviceId, setDeviceId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [profileWasCreated, setProfileWasCreated] = useState(false);

  const [skipInitiationThisSession, setSkipInitiationThisSession] = useState(false);

  useEffect(() => {
    const initializeDevice = async () => {
      try {
        // Check session storage for this session's profile creation status
        const sessionKey = 'skip_initiation_this_session';
        const shouldSkip = sessionStorage.getItem(sessionKey) === 'true';
        
        if (shouldSkip) {
          console.log('Skipping initiation this session');
          setSkipInitiationThisSession(true);
        }
        
        // ... rest of device ID logic ...
        
        if (user) {
          const { data: profile, error: selectError } = await supabase
            .from('profiles')
            .select('id')
            .eq('user_id', user.id)
            .maybeSingle();
          
          if (selectError) {
            console.error('Error checking profile:', selectError);
          } else if (!profile && !shouldSkip) {
            // Create profile
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
              // Mark to skip initiation this session only
              sessionStorage.setItem(sessionKey, 'true');
              setSkipInitiationThisSession(true);
              console.log('Created new profile - will skip initiation this session');
            }
          }
        } else {
          // Same logic for temp users...
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
    skipInitiationThisSession, // Renamed for clarity
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