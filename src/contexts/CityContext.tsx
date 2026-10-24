import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { CITIES, getCurrentCityId, setCurrentCityId, type CityConfig, type CityId } from "@/utils/cities";
import { clearDetailsCache } from "@/services/businesses";
import { clearSearchCache } from "@/services/search";
import { clearTileCache } from "@/hooks/useTileCache";

interface CityContextType {
  city: CityConfig;
  cityId: CityId;
  /** Switch cities. Clears every business cache so nothing from the old city lingers. */
  setCityId: (id: CityId) => void;
}

const CityContext = createContext<CityContextType | undefined>(undefined);

export function CityProvider({ children }: { children: ReactNode }) {
  const [cityId, setCityIdState] = useState<CityId>(getCurrentCityId);

  const setCityId = useCallback((id: CityId) => {
    if (id === getCurrentCityId()) return;
    setCurrentCityId(id);
    clearTileCache();
    clearDetailsCache();
    clearSearchCache();
    setCityIdState(id);
  }, []);

  const value = useMemo(() => ({ city: CITIES[cityId], cityId, setCityId }), [cityId, setCityId]);
  return <CityContext.Provider value={value}>{children}</CityContext.Provider>;
}

export function useCity() {
  const context = useContext(CityContext);
  if (context === undefined) throw new Error("useCity must be used within a CityProvider");
  return context;
}
