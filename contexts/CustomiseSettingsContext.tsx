import { createContext, type ReactNode, useContext } from "react";
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

  return (
    <CustomiseSettingsContext.Provider
      value={{
        hideLikedSongs,
        hideLyrics,
        hidePlaylists,
        setHideLikedSongs,
        setHideLyrics,
        setHidePlaylists,
      }}
    >
      {children}
    </CustomiseSettingsContext.Provider>
  );
}

export const useCustomiseSettings = () => {
  const context = useContext(CustomiseSettingsContext);
  if (!context) {
    throw new Error(
      "useCustomiseSettings must be used within CustomiseSettingsProvider"
    );
  }
  return context;
};
