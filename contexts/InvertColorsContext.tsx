import { setBackgroundColorAsync } from "expo-system-ui";
import { createContext, type ReactNode, use, useEffect, useMemo } from "react";
import { usePersistedState } from "@/hooks/usePersistedState";

interface InvertColorsContextType {
  invertColors: boolean;
  setInvertColors: (value: boolean) => Promise<void>;
}

const InvertColorsContext = createContext<InvertColorsContextType>({
  invertColors: false,
  setInvertColors: () => {
    throw new Error("useInvertColors must be used within InvertColorsProvider");
  },
});

export const useInvertColors = () => use(InvertColorsContext);

export const InvertColorsProvider = ({ children }: { children: ReactNode }) => {
  const [invertColors, setInvertColors] = usePersistedState(
    "invertColors",
    false
  );

  useEffect(() => {
    setBackgroundColorAsync(invertColors ? "white" : "black").catch(() => {
      // Activity may be destroyed during hot reload
    });
  }, [invertColors]);

  const value = useMemo(
    () => ({ invertColors, setInvertColors }),
    [invertColors, setInvertColors]
  );

  return (
    <InvertColorsContext.Provider value={value}>
      {children}
    </InvertColorsContext.Provider>
  );
};
