import { Capacitor } from "@capacitor/core";

/** True inside the iOS/Android shell, false in a normal browser. */
export const isCapacitor = (): boolean => {
  try {
    return Capacitor.isNativePlatform() || window.location.protocol === "capacitor:";
  } catch {
    return false;
  }
};

export const isAndroid = (): boolean => {
  try {
    return Capacitor.getPlatform() === "android";
  } catch {
    return false;
  }
};
