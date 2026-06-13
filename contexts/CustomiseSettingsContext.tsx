import { createContext, type ReactNode, use, useMemo } from "react";
import { usePersistedState } from "@/hooks/usePersistedState";

interface CustomiseSettingsContextType {
  hideLikedSongs: boolean;
  hideLyrics: boolean;
  hidePlaylists: boolean;
  setHideLikedSongs: (value: boolean) => Promise<void>;
  setHideLyrics: (value: boolean) => Promise<void>;
  setHidePlaylists: (value: boolean) => Promise<void>;
}

const CustomiseSettingsContext = createContext<
  CustomiseSettingsContextType | undefined
>(undefined);

export function CustomiseSettingsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [hideLikedSongs, setHideLikedSongs] = usePersistedState(
    "customise.hideLikedSongs",
    false
  );
  const [hideLyrics, setHideLyrics] = usePersistedState(
    "customise.hideLyrics",
    false
  );
  const [hidePlaylists, setHidePlaylists] = usePersistedState(
    "customise.hidePlaylists",
    false
  );

  const value = useMemo(
    () => ({
      hideLikedSongs,
      hideLyrics,
      hidePlaylists,
      setHideLikedSongs,
      setHideLyrics,
      setHidePlaylists,
    }),
    [
      hideLikedSongs,
      hideLyrics,
      hidePlaylists,
      setHideLikedSongs,
      setHideLyrics,
      setHidePlaylists,
    ]
  );

  return (
    <CustomiseSettingsContext.Provider value={value}>
      {children}
    </CustomiseSettingsContext.Provider>
  );
}

export const useCustomiseSettings = () => {
  const context = use(CustomiseSettingsContext);
  if (!context) {
    throw new Error(
      "useCustomiseSettings must be used within CustomiseSettingsProvider"
    );
  }
  return context;
};
