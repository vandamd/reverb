import { launchImageLibraryAsync } from "expo-image-picker";
import {
  type Asset,
  getAssetInfoAsync,
  getAssetsAsync,
  MediaType,
  requestPermissionsAsync,
  SortBy,
} from "expo-media-library";
import { type Href, router, useLocalSearchParams } from "expo-router";
import {
  memo,
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { HapticPressable } from "@/components/HapticPressable";
import { Header } from "@/components/Header";
import { MaterialIcon } from "@/components/MaterialIcon";
import { StyledText } from "@/components/StyledText";
import { SwipeBackContainer } from "@/components/SwipeBackContainer";
import { useInvertColors } from "@/contexts/InvertColorsContext";
import { useLibraryActions } from "@/contexts/LibraryContext";
import { saveCoverImage } from "@/utils/cover";
import { n } from "@/utils/scaling";

const COLUMN_COUNT = 3;
const PAGE_SIZE = 60;

type PhotoLoadState = "denied" | "loaded" | "loading";

interface PhotoGalleryState {
  hasMore: boolean;
  loadState: PhotoLoadState;
  photos: Asset[];
}

const initialPhotoGalleryState: PhotoGalleryState = {
  hasMore: true,
  loadState: "loading",
  photos: [],
};

interface PhotoTileProps {
  isSelected: boolean;
  item: Asset;
  onPress: (id: string) => void;
  size: number;
}

const PhotoTile = memo(function PhotoTile({
  item,
  isSelected,
  onPress,
  size,
}: PhotoTileProps) {
  return (
    <HapticPressable
      onPress={() => onPress(item.id)}
      style={[styles.tile, { height: size, width: size }]}
    >
      <Image source={{ uri: item.uri }} style={styles.photo} />
      {isSelected ? (
        <View style={styles.selectedOverlay}>
          <MaterialIcon color="white" name="check-circle" size={n(32)} />
        </View>
      ) : null}
    </HapticPressable>
  );
});

function usePlaylistCoverController() {
  const { invertColors } = useInvertColors();
  const { id, returnPath } = useLocalSearchParams<{
    id: string;
    returnPath?: string;
  }>();
  const { setPlaylistCover } = useLibraryActions();
  const { width } = useWindowDimensions();
  const [{ hasMore, loadState, photos }, dispatchPhotoGalleryState] =
    useReducer(
      (_state: PhotoGalleryState, nextState: PhotoGalleryState) => nextState,
      initialPhotoGalleryState
    );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const loadingMoreRef = useRef(false);
  const endCursorRef = useRef<string | undefined>(undefined);
  const photosRef = useRef<Asset[]>([]);

  const tileSize = Math.floor(width / COLUMN_COUNT);
  const isDraftCover = id === "draft" && Boolean(returnPath);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    }
  };

  const finishWithCoverUri = useCallback(
    async (coverUri: string) => {
      if (isDraftCover && returnPath) {
        router.replace(
          `${returnPath}?coverUri=${encodeURIComponent(coverUri)}` as Href
        );
        return;
      }

      await setPlaylistCover(id, coverUri);
      router.back();
    },
    [id, isDraftCover, returnPath, setPlaylistCover]
  );

  const saveSelectedAsset = useCallback(
    async (selectedAsset: {
      base64?: string | null;
      fileName?: string | null;
      filename?: string | null;
      mimeType?: string | null;
      sourceUris?: string[];
      uri: string;
    }) => {
      const draftId = `draft-${Date.now().toString(36)}`;
      const coverUri = await saveCoverImage(
        isDraftCover ? draftId : id,
        selectedAsset
      );
      await finishWithCoverUri(coverUri);
    },
    [finishWithCoverUri, id, isDraftCover]
  );

  const getSelectedPhotoAsset = useCallback(async (selectedPhoto: Asset) => {
    const mimeType = selectedPhoto.mediaType === "photo" ? "image/jpeg" : null;

    if (Platform.OS === "android") {
      return {
        filename: selectedPhoto.filename,
        mimeType,
        uri: selectedPhoto.uri,
      };
    }

    const assetInfo = await getAssetInfoAsync(selectedPhoto);
    return {
      filename: assetInfo.filename,
      mimeType,
      sourceUris: [assetInfo.localUri, selectedPhoto.uri].filter(
        (uri): uri is string => Boolean(uri)
      ),
      uri: assetInfo.localUri ?? assetInfo.uri,
    };
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    (async () => {
      try {
        const { status } = await requestPermissionsAsync(false, ["photo"]);
        if (cancelled) {
          return;
        }

        if (status !== "granted") {
          dispatchPhotoGalleryState({
            hasMore: false,
            loadState: "denied",
            photos: [],
          });
          return;
        }

        const result = await getAssetsAsync({
          first: PAGE_SIZE,
          mediaType: MediaType.photo,
          sortBy: [[SortBy.modificationTime, false]],
        });
        if (cancelled) {
          return;
        }

        photosRef.current = result.assets;
        endCursorRef.current = result.endCursor;
        dispatchPhotoGalleryState({
          hasMore: result.hasNextPage,
          loadState: "loaded",
          photos: result.assets,
        });
      } catch {
        if (!cancelled) {
          dispatchPhotoGalleryState({
            hasMore: false,
            loadState: "denied",
            photos: [],
          });
        }
      }
    })();

    return () => {
      cancelled = true;
      mountedRef.current = false;
    };
  }, []);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadState !== "loaded" || loadingMoreRef.current) {
      return;
    }

    loadingMoreRef.current = true;
    try {
      const result = await getAssetsAsync({
        after: endCursorRef.current,
        first: PAGE_SIZE,
        mediaType: MediaType.photo,
        sortBy: [[SortBy.modificationTime, false]],
      });

      if (!mountedRef.current) {
        return;
      }

      const seenIds = new Set(photosRef.current.map((photo) => photo.id));
      const nextPhotos = [
        ...photosRef.current,
        ...result.assets.filter((photo) => {
          if (seenIds.has(photo.id)) {
            return false;
          }
          seenIds.add(photo.id);
          return true;
        }),
      ];

      photosRef.current = nextPhotos;
      endCursorRef.current = result.endCursor;
      dispatchPhotoGalleryState({
        hasMore: result.hasNextPage,
        loadState: "loaded",
        photos: nextPhotos,
      });
    } finally {
      loadingMoreRef.current = false;
    }
  }, [hasMore, loadState]);

  const handleSelect = useCallback(
    (photoId: string) => {
      if (isSaving) {
        return;
      }

      setSelectedId((currentSelectedId) =>
        currentSelectedId === photoId ? null : photoId
      );
      setError(null);
    },
    [isSaving]
  );

  const handleSave = useCallback(async () => {
    if (!(id && selectedId) || isSaving) {
      return;
    }

    const selectedPhoto = photosRef.current.find(
      (photo) => photo.id === selectedId
    );
    if (!selectedPhoto) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await saveSelectedAsset(await getSelectedPhotoAsset(selectedPhoto));
    } catch {
      setError("Could not use this photo for the playlist cover.");
    } finally {
      if (mountedRef.current) {
        setIsSaving(false);
      }
    }
  }, [getSelectedPhotoAsset, id, isSaving, saveSelectedAsset, selectedId]);

  const handleUseSystemPicker = useCallback(async () => {
    if (isSaving) {
      return;
    }

    setError(null);

    try {
      const result = await launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [1, 1],
        base64: true,
        mediaTypes: ["images"],
        quality: 1,
      });

      if (result.canceled || result.assets.length === 0) {
        return;
      }

      setIsSaving(true);
      await saveSelectedAsset({
        base64: result.assets[0].base64,
        fileName: result.assets[0].fileName,
        mimeType: result.assets[0].mimeType,
        uri: result.assets[0].uri,
      });
    } catch {
      setError("Could not use this photo for the playlist cover.");
    } finally {
      if (mountedRef.current) {
        setIsSaving(false);
      }
    }
  }, [isSaving, saveSelectedAsset]);

  const renderItem = useCallback(
    ({ item }: { item: Asset }) => (
      <PhotoTile
        isSelected={selectedId === item.id}
        item={item}
        onPress={handleSelect}
        size={tileSize}
      />
    ),
    [handleSelect, selectedId, tileSize]
  );

  return {
    error,
    handleBack,
    handleSave,
    handleUseSystemPicker,
    invertColors,
    isSaving,
    loadMore,
    loadState,
    photos,
    renderItem,
    selectedId,
  };
}

export default function PlaylistCoverScreen() {
  const {
    error,
    handleBack,
    handleSave,
    handleUseSystemPicker,
    invertColors,
    isSaving,
    loadMore,
    loadState,
    photos,
    renderItem,
    selectedId,
  } = usePlaylistCoverController();

  return (
    <SwipeBackContainer enabled onSwipeBack={handleBack}>
      <View
        style={[
          styles.container,
          { backgroundColor: invertColors ? "white" : "black" },
        ]}
      >
        <Header
          headerTitle="Change Cover"
          rightAction={{
            icon: "check",
            onPress: handleSave,
            show: selectedId !== null,
          }}
        />
        <View style={styles.content}>
          {error ? (
            <StyledText style={styles.errorText}>{error}</StyledText>
          ) : null}
          {loadState === "loading" ? (
            <View style={styles.centered}>
              <ActivityIndicator
                color={invertColors ? "black" : "white"}
                size="large"
              />
            </View>
          ) : null}
          {loadState === "denied" ? (
            <View style={styles.centered}>
              <StyledText style={styles.messageText}>
                Photo access is not available
              </StyledText>
              <StyledText
                onPress={handleUseSystemPicker}
                style={styles.actionText}
              >
                Choose Photo
              </StyledText>
            </View>
          ) : null}
          {loadState === "loaded" && photos.length === 0 ? (
            <View style={styles.centered}>
              <StyledText style={styles.messageText}>
                No photos found
              </StyledText>
              <StyledText
                onPress={handleUseSystemPicker}
                style={styles.actionText}
              >
                Choose Photo
              </StyledText>
            </View>
          ) : null}
          {loadState === "loaded" && photos.length > 0 ? (
            <FlatList
              data={photos}
              initialNumToRender={18}
              keyExtractor={(item) => item.id}
              numColumns={COLUMN_COUNT}
              onEndReached={loadMore}
              onEndReachedThreshold={0.5}
              overScrollMode="never"
              removeClippedSubviews={false}
              renderItem={renderItem}
              showsVerticalScrollIndicator={false}
              windowSize={9}
            />
          ) : null}
          {isSaving ? (
            <View style={styles.savingOverlay}>
              <ActivityIndicator
                color={invertColors ? "black" : "white"}
                size="large"
              />
            </View>
          ) : null}
        </View>
      </View>
    </SwipeBackContainer>
  );
}

const styles = StyleSheet.create({
  centered: {
    alignItems: "center",
    flex: 1,
    gap: n(12),
    justifyContent: "center",
    paddingHorizontal: n(24),
  },
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    marginTop: n(8),
  },
  errorText: {
    fontSize: n(14),
    paddingHorizontal: n(20),
    paddingVertical: n(12),
  },
  actionText: {
    fontSize: n(24),
  },
  messageText: {
    fontSize: n(16),
    textAlign: "center",
  },
  photo: {
    height: "100%",
    width: "100%",
  },
  savingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.18)",
    justifyContent: "center",
  },
  selectedOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.38)",
    justifyContent: "center",
  },
  tile: {
    overflow: "hidden",
  },
});
