import {
  copyAsync,
  documentDirectory,
  EncodingType,
  makeDirectoryAsync,
  writeAsStringAsync,
} from "expo-file-system/legacy";

interface CoverAsset {
  base64?: string | null;
  fileName?: string | null;
  filename?: string | null;
  mimeType?: string | null;
  sourceUris?: string[];
  uri: string;
}

const getCoverExtension = (asset: CoverAsset) => {
  const fileName = asset.fileName ?? asset.filename;
  if (fileName?.includes(".")) {
    return fileName.split(".").pop() ?? "jpg";
  }
  if (asset.mimeType === "image/png") {
    return "png";
  }
  return "jpg";
};

const copyFirstAvailableSource = async (
  sourceUris: string[],
  destination: string,
  index = 0,
  lastError?: unknown
): Promise<{ error?: unknown; ok: boolean }> => {
  const sourceUri = sourceUris[index];
  if (!sourceUri) {
    return { error: lastError, ok: false };
  }

  try {
    await copyAsync({ from: sourceUri, to: destination });
    return { ok: true };
  } catch (error) {
    return copyFirstAvailableSource(sourceUris, destination, index + 1, error);
  }
};

export const saveCoverImage = async (playlistId: string, asset: CoverAsset) => {
  if (!documentDirectory) {
    return asset.uri;
  }

  const directory = `${documentDirectory}playlist-covers/`;
  await makeDirectoryAsync(directory, { intermediates: true });
  const extension = getCoverExtension(asset);
  const destination = `${directory}${playlistId}-${Date.now()}.${extension}`;
  const sourceUris = [...new Set([asset.uri, ...(asset.sourceUris ?? [])])];

  const copyResult = await copyFirstAvailableSource(sourceUris, destination);
  if (copyResult.ok) {
    return destination;
  }

  if (asset.base64) {
    await writeAsStringAsync(destination, asset.base64, {
      encoding: EncodingType.Base64,
    });
    return destination;
  }

  throw copyResult.error instanceof Error
    ? copyResult.error
    : new Error("Unable to save cover image.");
};
