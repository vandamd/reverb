import { PixelRatio } from "react-native";

const TARGET_DENSITY = 2.55;

export const n = (size: number) => size * (TARGET_DENSITY / PixelRatio.get());
