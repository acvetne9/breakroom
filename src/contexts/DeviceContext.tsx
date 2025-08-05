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
  
  // Combine characteristics and add random component
  const fingerprint = btoa(`${canvasFingerprint}-${screen}-${timezone}-${language}-${userAgent}`);
  const randomSuffix = Math.random().toString(36).substring(2, 15);
  
  return `device_${fingerprint.substring(0, 20)}_${randomSuffix}`;
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