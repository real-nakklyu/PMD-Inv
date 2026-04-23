import type { ExpoConfig } from "expo/config";

const profile = process.env.EAS_BUILD_PROFILE ?? "development";

const variant =
  profile === "production"
    ? {
        name: "PMDInv Mobile",
        bundleIdentifier: "com.pmdinv.mobile",
        scheme: "pmdinv",
      }
    : profile === "preview"
      ? {
          name: "PMDInv Preview",
          bundleIdentifier: "com.pmdinv.mobile.preview",
          scheme: "pmdinv-preview",
        }
      : {
          name: "PMDInv Dev",
          bundleIdentifier: "com.pmdinv.mobile.dev",
          scheme: "pmdinv-dev",
        };

const config: ExpoConfig = {
  name: variant.name,
  slug: "pmdinv-mobile",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: variant.scheme,
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
    bundleIdentifier: variant.bundleIdentifier,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    package: variant.bundleIdentifier,
  },
  web: {
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    "expo-dev-client",
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#ffffff",
        dark: {
          backgroundColor: "#000000",
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    appName: variant.name,
    profile,
  },
};

export default config;
