import { setBackgroundColorAsync } from "expo-system-ui";
import { createContext, type ReactNode, useContext, useEffect } from "react";
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

export const useInvertColors = () => useContext(InvertColorsContext);

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

  return (
    <InvertColorsContext.Provider value={{ invertColors, setInvertColors }}>
      {children}
    </InvertColorsContext.Provider>
  );
};
