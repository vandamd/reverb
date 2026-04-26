import { MaterialIcons } from "@react-native-vector-icons/material-icons";
import type { ComponentProps } from "react";

const materialIconSymbols = {
  add: "add",
  album: "album",
  "arrow-back-ios": "arrow-back-ios",
  check: "check",
  "check-circle": "check-circle",
  close: "close",
  edit: "edit",
  favorite: "favorite",
  "favorite-outline": "favorite-outline",
  "graphic-eq": "graphic-eq",
  "mic-external-on": "mic-external-on",
  "music-note": "music-note",
  pause: "pause",
  "play-arrow": "play-arrow",
  "queue-music": "queue-music",
  "radio-button-checked": "radio-button-checked",
  "radio-button-unchecked": "radio-button-unchecked",
  repeat: "repeat",
  "repeat-one": "repeat-one",
  search: "search",
  settings: "settings",
  shuffle: "shuffle",
  "skip-next": "skip-next",
  "skip-previous": "skip-previous",
  sort: "sort",
} as const;

export type MaterialIconName = keyof typeof materialIconSymbols;

interface MaterialIconProps
  extends Omit<ComponentProps<typeof MaterialIcons>, "name"> {
  name: MaterialIconName;
}

export function MaterialIcon({ name, ...props }: MaterialIconProps) {
  return <MaterialIcons name={materialIconSymbols[name]} {...props} />;
}
