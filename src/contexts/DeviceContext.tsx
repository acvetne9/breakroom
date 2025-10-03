import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from "@/integrations/supabase/client";

interface DeviceContextType {
  deviceId: string;
  loading: boolean;
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

  useEffect(() => {
    const initializeDevice = async () => {
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
      
      // Create profile on initial load if authenticated or temp user doesn't have one
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        // Authenticated user - ensure profile exists
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();
        
        if (!profile) {
          await supabase
            .from('profiles')
            .insert({
              user_id: user.id,
              display_name: user.email?.split('@')[0] || 'User',
              is_authenticated: true
            });
        }
      } else {
        // Temp user - ensure profile exists
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('temp_user_id', storedDeviceId)
          .maybeSingle();
        
        if (!profile) {
          await supabase
            .from('profiles')
            .insert({
              user_id: null,
              temp_user_id: storedDeviceId,
              display_name: 'Anonymous User',
              is_authenticated: false
            });
        }
      }
      
      setDeviceId(storedDeviceId);
      setLoading(false);
    };
    
    initializeDevice();
  }, []);

  const value = {
    deviceId,
    loading,
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