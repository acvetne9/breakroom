import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase, updateDeviceIdHeader } from "@/integrations/supabase/client";
import { generateBrowserFingerprint, generateLegacyBrowserFingerprint } from "@/utils/browserFingerprint";

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

        // Generate browser fingerprints for recovery
        const browserFingerprint = generateBrowserFingerprint();
        const legacyFingerprint = generateLegacyBrowserFingerprint();
        console.log("🔍 FINGERPRINT DEBUG:", {
          current: browserFingerprint,
          legacy: legacyFingerprint,
          timestamp: new Date().toISOString(),
        });

        let storedDeviceId = localStorage.getItem("device_id");

        // Check if old device ID format (with device_ prefix) and clear it
        if (storedDeviceId && storedDeviceId.startsWith("device_")) {
          console.log("⚠️ Clearing old device ID format (non-UUID):", storedDeviceId);
          localStorage.removeItem("device_id");
          storedDeviceId = null;
        }

        // If no device_id in localStorage, try to recover from fingerprint
        if (!storedDeviceId) {
          console.log("❌ No device_id in localStorage, attempting fingerprint recovery...");

          // Try new fingerprint format first
          console.log("🔍 Query 1: Looking for profile with current fingerprint:", browserFingerprint);
          let existingProfile = await supabase
            .from("profiles")
            .select("temp_user_id, browser_fingerprint, id")
            .eq("browser_fingerprint", browserFingerprint)
            .eq("is_authenticated", false)
            .maybeSingle();

          // If not found, try legacy fingerprint format for backward compatibility
          if (!existingProfile?.data) {
            console.log("❌ No profile found with current fingerprint");
            console.log("🔍 Query 2: Looking for profile with legacy fingerprint:", legacyFingerprint);

            existingProfile = await supabase
              .from("profiles")
              .select("temp_user_id, browser_fingerprint, id")
              .eq("browser_fingerprint", legacyFingerprint)
              .eq("is_authenticated", false)
              .maybeSingle();

            // If found with old fingerprint, migrate it to new format
            if (existingProfile?.data?.temp_user_id) {
              console.log("✅ RECOVERY PATH 1: Found profile with legacy fingerprint:", existingProfile.data);
              console.log("🔄 Migrating to new fingerprint format...");
              await supabase
                .from("profiles")
                .update({ browser_fingerprint: browserFingerprint })
                .eq("temp_user_id", existingProfile.data.temp_user_id);
            } else {
              console.log("❌ No profile found with legacy fingerprint");
            }
          } else {
            console.log("✅ RECOVERY PATH 2: Found profile with current fingerprint:", existingProfile.data);
          }

          if (existingProfile?.error) {
            console.error("❌ Error looking up profile by fingerprint:", existingProfile.error);
          } else if (existingProfile?.data?.temp_user_id) {
            // Recovered device_id from fingerprint!
            storedDeviceId = existingProfile.data.temp_user_id;
            localStorage.setItem("device_id", storedDeviceId);
            console.log("✅ Recovered device_id from fingerprint:", storedDeviceId);
          } else {
            console.log("⚠️ No profile found with either fingerprint");
          }
        } else {
          console.log("✅ RECOVERY PATH 3: Found device_id in localStorage:", storedDeviceId);
        }

        // Fallback: Try to find most recent unauthenticated profile without fingerprint
        if (!storedDeviceId) {
          console.log("🔍 Query 3: Looking for recent unauthenticated profile without fingerprint...");
          const { data: recentProfile, error: recentError } = await supabase
            .from("profiles")
            .select("temp_user_id, id, created_at, browser_fingerprint")
            .eq("is_authenticated", false)
            .is("browser_fingerprint", null)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (recentError) {
            console.error("❌ Error querying recent profile:", recentError);
          }

          if (recentProfile?.temp_user_id) {
            console.log("✅ RECOVERY PATH 4: Found recent unauthenticated profile:", recentProfile);
            storedDeviceId = recentProfile.temp_user_id;
            localStorage.setItem("device_id", storedDeviceId);
            console.log("🔄 Updating profile with current fingerprint...");
            await supabase
              .from("profiles")
              .update({ browser_fingerprint: browserFingerprint })
              .eq("temp_user_id", storedDeviceId);
          } else {
            console.log("❌ No recent unauthenticated profile found");
          }
        }

        // Generate new UUID if still no device ID
        if (!storedDeviceId) {
          storedDeviceId = generateDeviceId();
          localStorage.setItem("device_id", storedDeviceId);
          console.log("✅ Generated new UUID device ID:", storedDeviceId);
        }

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
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
          } else if (profile) {
            console.log("Profile already exists for authenticated user");

            // Update fingerprint if it's missing
            const { data: profileData } = await supabase
              .from("profiles")
              .select("browser_fingerprint")
              .eq("id", profile.id)
              .single();

            if (profileData && !profileData.browser_fingerprint) {
              const { error: updateError } = await supabase
                .from("profiles")
                .update({ browser_fingerprint: browserFingerprint })
                .eq("id", profile.id);

              if (!updateError) {
                console.log("Updated existing authenticated profile with browser fingerprint");
              }
            }
          }
        } else {
          const { data: profile, error: selectError } = await supabase
            .from("profiles")
            .select("id")
            .eq("temp_user_id", storedDeviceId)
            .maybeSingle();

          if (selectError) {
            console.error("Error checking temp profile:", selectError);
          } else if (!profile) {
            const { error: insertError } = await supabase.from("profiles").insert({
              user_id: null,
              temp_user_id: storedDeviceId,
              display_name: "Anonymous User",
              is_authenticated: false,
              browser_fingerprint: browserFingerprint,
            });

            if (insertError && insertError.code !== "23505") {
              console.error("Error creating temp profile:", insertError);
            } else if (!insertError) {
              localStorage.setItem("profile_created_in_session", thisSessionId);
              setIsFirstSession(true);
              console.log("Created new profile for temp user");
            }
          } else if (profile) {
            console.log("Temp profile already exists");

            // Update fingerprint if it's missing
            const { data: profileData } = await supabase
              .from("profiles")
              .select("browser_fingerprint")
              .eq("id", profile.id)
              .single();

            if (profileData && !profileData.browser_fingerprint) {
              const { error: updateError } = await supabase
                .from("profiles")
                .update({ browser_fingerprint: browserFingerprint })
                .eq("id", profile.id);

              if (!updateError) {
                console.log("Updated existing temp profile with browser fingerprint");
              }
            }
          }
        }

        setDeviceId(storedDeviceId);
        // Update Supabase client header with device_id
        updateDeviceIdHeader(storedDeviceId);
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
