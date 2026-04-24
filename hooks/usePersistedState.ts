import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

export function usePersistedState<T>(key: string, defaultValue: T) {
  const [value, setValue] = useState<T>(defaultValue);

  useEffect(() => {
    AsyncStorage.getItem(key).then((stored) => {
      if (stored !== null) {
        try {
          setValue(JSON.parse(stored));
        } catch {
          AsyncStorage.removeItem(key);
        }
      }
    });
  }, [key]);

  const setPersistedValue = useCallback(
    async (newValue: T) => {
      setValue(newValue);
      await AsyncStorage.setItem(key, JSON.stringify(newValue));
    },
    [key]
  );

  return [value, setPersistedValue] as const;
}
