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
        const currentSessionId = sessionStorage.getItem("current_session_id");
        const profileCreatedInSession = localStorage.getItem("profile_created_in_session");

        let thisSessionId = currentSessionId;
        if (!thisSessionId) {
          thisSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          sessionStorage.setItem("current_session_id", thisSessionId);
        }

        if (profileCreatedInSession === thisSessionId) {
          setIsFirstSession(true);
          console.log("Profile was created in this session");
        } else {
          setIsFirstSession(false);
          console.log("Profile was created in a different session (or not at all)");
        }

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
          console.log("✅ Generated new UUID device ID:", storedDeviceId);
        } else {
          console.log("✅ Found device_id in localStorage:", storedDeviceId);
        }

        // Check if user is authenticated
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          // Authenticated user - not needed for your use case but keeping for completeness
          const { data: profile, error: selectError } = await supabase
            .from("profiles")
            .select("id")
            .eq("user_id", user.id)
            .maybeSingle();

          if (selectError) {
            console.error("Error checking profile:", selectError);
          } else if (!profile) {
            const { error: insertError } = await supabase.from("profiles").insert({
              user_id: user.id,
              display_name: user.email?.split("@")[0] || "User",
              is_authenticated: true,
            });

            if (insertError && insertError.code !== "23505") {
              console.error("Error creating profile:", insertError);
            } else if (!insertError) {
              localStorage.setItem("profile_created_in_session", thisSessionId);
              setIsFirstSession(true);
              console.log("Created new profile for authenticated user");
            }
          } else {
            console.log("Profile already exists for authenticated user");
          }
        }

        // Set the device ID (UUID) - this is what gets used in current_jobs.profile_id
        setDeviceId(storedDeviceId);

        // Update Supabase client header with device_id
        updateDeviceIdHeader(storedDeviceId);

        console.log("✅ Device initialization complete. Device ID:", storedDeviceId);
      } catch (error) {
        console.error("Fatal error in device initialization:", error);
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
