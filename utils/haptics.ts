import { ImpactFeedbackStyle, impactAsync } from "expo-haptics";

export const triggerHaptic = () => impactAsync(ImpactFeedbackStyle.Light);
