import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';

interface ConnectionContextType {
  isOnline: boolean;
  registerReconnectCallback: (callback: () => void | Promise<void>) => () => void;
  retryWithBackoff: <T>(
    fn: () => Promise<T>,
    options?: { maxRetries?: number; initialDelay?: number }
  ) => Promise<T>;
}

const ConnectionContext = createContext<ConnectionContextType | undefined>(undefined);

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const reconnectCallbacksRef = useRef<Set<() => void | Promise<void>>>(new Set());
  const wasOfflineRef = useRef(!navigator.onLine);

  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);

      // Only trigger callbacks if we were previously offline
      if (wasOfflineRef.current) {
        console.log('[ConnectionContext] Connection restored, triggering callbacks');

        // Execute all registered reconnect callbacks
        const callbacks = Array.from(reconnectCallbacksRef.current);
        await Promise.allSettled(callbacks.map(callback => callback()));

        wasOfflineRef.current = false;
      }
    };

    const handleOffline = () => {
      console.log('[ConnectionContext] Connection lost');
      setIsOnline(false);
      wasOfflineRef.current = true;
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const registerReconnectCallback = useCallback((callback: () => void | Promise<void>) => {
    reconnectCallbacksRef.current.add(callback);

    // Return unregister function
    return () => {
      reconnectCallbacksRef.current.delete(callback);
    };
  }, []);

  const retryWithBackoff = useCallback(async <T,>(
    fn: () => Promise<T>,
    options: { maxRetries?: number; initialDelay?: number } = {}
  ): Promise<T> => {
    const { maxRetries = 3, initialDelay = 1000 } = options;
    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        // Don't retry if we're offline
        if (!navigator.onLine) {
          throw new Error('Offline: ' + lastError.message);
        }

        // Don't wait after the last attempt
        if (attempt < maxRetries) {
          const delay = initialDelay * Math.pow(2, attempt);
          console.log(`[ConnectionContext] Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError!;
  }, []);

  const value = useMemo(
    () => ({ isOnline, registerReconnectCallback, retryWithBackoff }),
    [isOnline, registerReconnectCallback, retryWithBackoff]
  );

  return (
    <ConnectionContext.Provider value={value}>
      {children}
    </ConnectionContext.Provider>
  );
}

export function useConnection() {
  const context = useContext(ConnectionContext);
  if (context === undefined) {
    throw new Error('useConnection must be used within a ConnectionProvider');
  }
  return context;
}
