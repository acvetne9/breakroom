import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase, updateDeviceIdHeader } from "@/integrations/supabase/client";

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
  // Generate a proper UUID v4
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function DeviceProvider({ children }: DeviceProviderProps) {
  const [deviceId, setDeviceId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [isFirstSession, setIsFirstSession] = useState(false);

  useEffect(() => {
    const initializeDevice = async () => {
      try {
        // Check if this is a new device (no device_id in localStorage)
        let storedDeviceId = localStorage.getItem("device_id");

        // Clear old device ID format (with device_ prefix)
        if (storedDeviceId && storedDeviceId.startsWith("device_")) {
          console.log("⚠️ Clearing old device ID format (non-UUID):", storedDeviceId);
          localStorage.removeItem("device_id");
          storedDeviceId = null;
        }

        // Generate new UUID if no device ID exists
        if (!storedDeviceId) {
          storedDeviceId = generateDeviceId();
          localStorage.setItem("device_id", storedDeviceId);
          setIsFirstSession(true);
          console.log("✅ Generated new UUID device ID:", storedDeviceId);

          // Create profile in database immediately
          const { error } = await supabase.from("profiles").insert({ id: storedDeviceId });

          if (error) {
            console.error("❌ Error creating profile:", error);
          } else {
            console.log("✅ Profile created in database");
          }
        } else {
          setIsFirstSession(false);
          console.log("✅ Found existing device_id in localStorage:", storedDeviceId);

          // Verify profile exists, create if missing
          const { data: existingProfile } = await supabase
            .from("profiles")
            .select("id")
            .eq("id", storedDeviceId)
            .maybeSingle();

          if (!existingProfile) {
            console.log("⚠️ Profile missing, creating it now");
            const { error } = await supabase.from("profiles").insert({ id: storedDeviceId });

            if (error) {
              console.error("❌ Error creating profile:", error);
            } else {
              console.log("✅ Profile created in database");
            }
          }
        }

        // Set the device ID (UUID) - this is what gets used in current_jobs.profile_id
        setDeviceId(storedDeviceId);

        // Update Supabase client header with device_id
        updateDeviceIdHeader(storedDeviceId);

        console.log("✅ Device initialization complete. Device ID:", storedDeviceId);
      } catch (error) {
        console.error("❌ Fatal error in device initialization:", error);
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
    throw new Error("useDevice must be used within a DeviceProvider");
  }
  return context;
}
