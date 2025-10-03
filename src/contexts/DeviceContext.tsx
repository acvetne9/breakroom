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

  useEffect(() => {
    const initializeDevice = async () => {
      try {
        // Check session storage first for this session's profile creation status
        const sessionKey = 'profile_created_this_session';
        const createdThisSession = sessionStorage.getItem(sessionKey) === 'true';
        
        if (createdThisSession) {
          console.log('✅ Profile was already created in this session');
          setProfileWasCreated(true);
        }
        
        // Check if device ID exists in localStorage
        let storedDeviceId = localStorage.getItem('device_id');
        
        // Clear old device IDs that have random suffixes (old format)
        if (storedDeviceId && storedDeviceId.split('_').length > 2) {
          console.log('🧹 Clearing old device ID format:', storedDeviceId);
          localStorage.removeItem('device_id');
          storedDeviceId = null;
        }
        
        if (!storedDeviceId) {
          // Generate new device ID if none exists
          storedDeviceId = generateDeviceId();
          localStorage.setItem('device_id', storedDeviceId);
          console.log('🆔 Generated new device ID:', storedDeviceId);
        }
        
        // Check for authenticated user
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
          // Authenticated user - ensure profile exists
          const { data: profile, error: selectError } = await supabase
            .from('profiles')
            .select('id')
            .eq('user_id', user.id)
            .maybeSingle();
          
          if (selectError) {
            console.error('❌ Error checking profile:', selectError);
          } else if (!profile && !createdThisSession) {
            // Profile doesn't exist and we haven't created one this session
            const { error: insertError } = await supabase
              .from('profiles')
              .insert({
                user_id: user.id,
                display_name: user.email?.split('@')[0] || 'User',
                is_authenticated: true
              });
            
            if (insertError) {
              // Check if it's a duplicate key error (profile already exists)
              if (insertError.code === '23505') {
                console.log('ℹ️ Profile already exists (concurrent creation)');
              } else {
                console.error('❌ Error creating profile:', insertError);
              }
            } else {
              // Successfully created profile
              sessionStorage.setItem(sessionKey, 'true');
              setProfileWasCreated(true);
              console.log('✨ Created new profile for authenticated user');
            }
          } else if (profile) {
            console.log('ℹ️ Profile already exists for authenticated user');
          }
        } else {
          // Temp user - ensure profile exists
          const { data: profile, error: selectError } = await supabase
            .from('profiles')
            .select('id')
            .eq('temp_user_id', storedDeviceId)
            .maybeSingle();
          
          if (selectError) {
            console.error('❌ Error checking temp profile:', selectError);
          } else if (!profile && !createdThisSession) {
            // Profile doesn't exist and we haven't created one this session
            const { error: insertError } = await supabase
              .from('profiles')
              .insert({
                user_id: null,
                temp_user_id: storedDeviceId,
                display_name: 'Anonymous User',
                is_authenticated: false
              });
            
            if (insertError) {
              // Check if it's a duplicate key error (profile already exists)
              if (insertError.code === '23505') {
                console.log('ℹ️ Temp profile already exists (concurrent creation)');
              } else {
                console.error('❌ Error creating temp profile:', insertError);
              }
            } else {
              // Successfully created profile
              sessionStorage.setItem(sessionKey, 'true');
              setProfileWasCreated(true);
              console.log('✨ Created new profile for temp user');
            }
          } else if (profile) {
            console.log('ℹ️ Temp profile already exists');
          }
        }
        
        setDeviceId(storedDeviceId);
      } catch (error) {
        console.error('❌ Fatal error in device initialization:', error);
      } finally {
        setLoading(false);
      }
    };
    
    initializeDevice();
  }, []);

  const value = {
    deviceId,
    loading,
    profileWasCreated,
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