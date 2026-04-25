import { router } from "expo-router";
import { OptionsSelector } from "@/components/OptionsSelector";
import { usePersistedState } from "@/hooks/usePersistedState";

type PlaylistsSortOrder = "name" | "createdAt";

const options = [
  { label: "Name", value: "name" },
  { label: "Creation Date", value: "createdAt" },
];

export default function PlaylistsSortScreen() {
  const [sortOrder, setSortOrder] = usePersistedState<PlaylistsSortOrder>(
    "playlists.sort",
    "name"
  );

  const handleSelect = async (value: string) => {
    await setSortOrder(value as PlaylistsSortOrder);
    router.back();
  };

  return (
    <OptionsSelector
      onSelect={handleSelect}
      options={options}
      selectedValue={sortOrder}
      title="Sort Playlists"
    />
  );
}
