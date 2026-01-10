import { useEffect } from 'react';
import { useConnection } from '@/contexts/ConnectionContext';
import { clearSearchCache } from '@/services/unifiedSearch';

/**
 * Hook to automatically handle cache invalidation and data refresh on reconnection.
 * This hook should be used in components that need to refresh their data when
 * the internet connection is restored.
 */
export function useReconnectionHandler(options?: {
  onReconnect?: () => void | Promise<void>;
  clearSearchCacheOnReconnect?: boolean;
}) {
  const { registerReconnectCallback } = useConnection();
  const { onReconnect, clearSearchCacheOnReconnect = true } = options || {};

  useEffect(() => {
    const handleReconnect = async () => {
      console.log('[useReconnectionHandler] Handling reconnection');

      // Clear search cache by default
      if (clearSearchCacheOnReconnect) {
        clearSearchCache();
      }

      // Execute custom callback if provided
      if (onReconnect) {
        await onReconnect();
      }
    };

    // Register the callback and get the unregister function
    const unregister = registerReconnectCallback(handleReconnect);

    // Cleanup on unmount
    return unregister;
  }, [registerReconnectCallback, onReconnect, clearSearchCacheOnReconnect]);
}
