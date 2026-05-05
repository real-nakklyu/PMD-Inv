import { DynamicColorIOS, Platform, type ColorValue } from "react-native";

export const lightColors = {
  background: "#ffffff",
  surface: "#ffffff",
  surfaceMuted: "#f6f8fa",
  primary: "#0969da",
  primarySoft: "#ddf4ff",
  accent: "#8250df",
  text: "#1f2328",
  textMuted: "#59636e",
  border: "#d1d9e0",
  danger: "#d1242f",
  dangerSoft: "#ffebe9",
  warning: "#9a6700",
  warningSoft: "#fff8c5",
  info: "#0969da",
  infoSoft: "#ddf4ff",
  success: "#0969da",
  successSoft: "#ddf4ff",
  shadow: "#1f2328",
} as const;

export const darkColors = {
  background: "#0d1117",
  surface: "#151b23",
  surfaceMuted: "#212830",
  primary: "#1f6feb",
  primarySoft: "#388bfd26",
  accent: "#ab7df8",
  text: "#f0f6fc",
  textMuted: "#9198a1",
  border: "#3d444d",
  danger: "#f85149",
  dangerSoft: "#f851491a",
  warning: "#d29922",
  warningSoft: "#bb800926",
  info: "#4493f8",
  infoSoft: "#388bfd1a",
  success: "#58a6ff",
  successSoft: "#388bfd26",
  shadow: "#010409",
} as const;

const adaptiveColor = (light: string, dark: string): ColorValue => {
  if (Platform.OS === "ios") {
    return DynamicColorIOS({ light, dark });
  }

  return light;
};

export const colors = {
  background: adaptiveColor(lightColors.background, darkColors.background),
  surface: adaptiveColor(lightColors.surface, darkColors.surface),
  surfaceMuted: adaptiveColor(lightColors.surfaceMuted, darkColors.surfaceMuted),
  primary: adaptiveColor(lightColors.primary, darkColors.primary),
  primarySoft: adaptiveColor(lightColors.primarySoft, darkColors.primarySoft),
  accent: adaptiveColor(lightColors.accent, darkColors.accent),
  text: adaptiveColor(lightColors.text, darkColors.text),
  textMuted: adaptiveColor(lightColors.textMuted, darkColors.textMuted),
  border: adaptiveColor(lightColors.border, darkColors.border),
  danger: adaptiveColor(lightColors.danger, darkColors.danger),
  dangerSoft: adaptiveColor(lightColors.dangerSoft, darkColors.dangerSoft),
  warning: adaptiveColor(lightColors.warning, darkColors.warning),
  warningSoft: adaptiveColor(lightColors.warningSoft, darkColors.warningSoft),
  info: adaptiveColor(lightColors.info, darkColors.info),
  infoSoft: adaptiveColor(lightColors.infoSoft, darkColors.infoSoft),
  success: adaptiveColor(lightColors.success, darkColors.success),
  successSoft: adaptiveColor(lightColors.successSoft, darkColors.successSoft),
  shadow: adaptiveColor(lightColors.shadow, darkColors.shadow),
} as const;

export const spacing = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 28,
} as const;
