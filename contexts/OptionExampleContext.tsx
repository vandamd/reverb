import { createContext, type ReactNode, useContext } from "react";
import { usePersistedState } from "@/hooks/usePersistedState";

export type OptionExample = "option-1" | "option-2" | "option-3";

interface OptionExampleContextType {
  optionExample: OptionExample;
  setOptionExample: (value: OptionExample) => Promise<void>;
}

const OptionExampleContext = createContext<OptionExampleContextType>({
  optionExample: "option-1",
  setOptionExample: () => {
    throw new Error(
      "useOptionExample must be used within OptionExampleProvider"
    );
  },
});

export const useOptionExample = () => useContext(OptionExampleContext);

export const OptionExampleProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [optionExample, setOptionExample] = usePersistedState<OptionExample>(
    "optionExample",
    "option-1"
  );

  return (
    <OptionExampleContext.Provider value={{ optionExample, setOptionExample }}>
      {children}
    </OptionExampleContext.Provider>
  );
};
