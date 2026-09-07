import { createContext, useContext, useMemo, ReactNode } from "react";
import { getDeviceId, isNewDevice } from "@/utils/deviceId";

interface DeviceContextType {
  /** Stable anonymous id for this browser/device. Also the `profiles.id`. */
  deviceId: string;
  /** True on the very first visit from this device. */
  isFirstSession: boolean;
}

const DeviceContext = createContext<DeviceContextType | undefined>(undefined);

export function DeviceProvider({ children }: { children: ReactNode }) {
  // Reading the id is synchronous, so there is no loading state to expose.
  const value = useMemo(() => ({ deviceId: getDeviceId(), isFirstSession: isNewDevice() }), []);
  return <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>;
}

export function useDevice() {
  const context = useContext(DeviceContext);
  if (context === undefined) {
    throw new Error("useDevice must be used within a DeviceProvider");
  }
  return context;
}
