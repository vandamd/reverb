import { router } from "expo-router";
import { OptionsSelector } from "@/components/OptionsSelector";
import { usePersistedState } from "@/hooks/usePersistedState";

type AlbumsSortOrder = "artist" | "title";

const options = [
  { label: "Artist", value: "artist" },
  { label: "Title", value: "title" },
];

export default function AlbumsSortScreen() {
  const [sortOrder, setSortOrder] = usePersistedState<AlbumsSortOrder>(
    "albums.sort",
    "artist"
  );

  const handleSelect = async (value: string) => {
    await setSortOrder(value as AlbumsSortOrder);
    router.back();
  };

  return (
    <OptionsSelector
      onSelect={handleSelect}
      options={options}
      selectedValue={sortOrder}
      title="Sort Albums"
    />
  );
}
