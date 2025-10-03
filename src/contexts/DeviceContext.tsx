import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

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
    // Check if device ID exists in localStorage
    let storedDeviceId = localStorage.getItem('device_id');
    
    if (!storedDeviceId) {
      // Generate new device ID if none exists
      storedDeviceId = generateDeviceId();
      localStorage.setItem('device_id', storedDeviceId);
    }
    
    setDeviceId(storedDeviceId);
    setLoading(false);
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