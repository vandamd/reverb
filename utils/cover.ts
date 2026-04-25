import {
  copyAsync,
  documentDirectory,
  makeDirectoryAsync,
} from "expo-file-system/legacy";
import type { ImagePickerAsset } from "expo-image-picker";

const getCoverExtension = (asset: ImagePickerAsset) => {
  if (asset.fileName?.includes(".")) {
    return asset.fileName.split(".").pop() ?? "jpg";
  }
  if (asset.mimeType === "image/png") {
    return "png";
  }
  return "jpg";
};

export const saveCoverImage = async (
  playlistId: string,
  asset: ImagePickerAsset
) => {
  if (!documentDirectory) {
    return asset.uri;
  }

  const directory = `${documentDirectory}playlist-covers/`;
  await makeDirectoryAsync(directory, { intermediates: true });
  const extension = getCoverExtension(asset);
  const destination = `${directory}${playlistId}-${Date.now()}.${extension}`;
  await copyAsync({ from: asset.uri, to: destination });
  return destination;
};
