import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Nexus Study',
  slug: 'nexus-study',
  scheme: 'nexusstudy',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  userInterfaceStyle: 'dark',
  ios: {
    bundleIdentifier: 'com.nexusstudy.app',
    supportsTablet: true,
    associatedDomains: ['applinks:nexusstudy.app'],
    infoPlist: {
      UIApplicationShortcutItems: [
        { UIApplicationShortcutItemType: 'new-lesson', UIApplicationShortcutItemTitle: 'New Lesson', UIApplicationShortcutItemSubtitle: 'Create a lesson', UIApplicationShortcutItemIconType: 'UIApplicationShortcutIconTypeCompose' },
        { UIApplicationShortcutItemType: 'continue-study', UIApplicationShortcutItemTitle: 'Continue', UIApplicationShortcutItemSubtitle: 'Resume your last lesson', UIApplicationShortcutItemIconType: 'UIApplicationShortcutIconTypePlay' },
        { UIApplicationShortcutItemType: 'practice', UIApplicationShortcutItemTitle: 'Practice', UIApplicationShortcutItemSubtitle: 'Quick practice', UIApplicationShortcutItemIconType: 'UIApplicationShortcutIconTypeTask' },
      ],
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'com.nexusstudy.app',
    adaptiveIcon: {
      foregroundImage: './assets/images/adaptive-icon.png',
      backgroundColor: '#000000',
    },
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [
          { scheme: 'https', host: 'nexusstudy.app' },
        ],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  plugins: [
    '@sentry/react-native',
    'expo-asset',
    'expo-font',
    'expo-router',
    'expo-secure-store',
    ['expo-splash-screen', {
      image: './assets/images/icon.png',
      imageWidth: 200,
      resizeMode: 'contain',
      backgroundColor: '#000000',
    }],
    'expo-sqlite',
    'expo-web-browser',
    ['expo-notifications', {
      icon: './assets/images/notification-icon.png',
      color: '#A855F7',
    }],
    [
      'expo-image-picker', {
        photosPermission: 'Allow Nexus Study to access your photos to upload study materials.',
        cameraPermission: 'Allow Nexus Study to use your camera to capture study materials.',
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    apiBase: process.env.EXPO_PUBLIC_API_BASE
      ?? (process.env.EAS_BUILD_PROFILE === 'production' ? undefined : 'http://127.0.0.1:8000'),
    googleClientIdIos: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS,
    googleClientIdAndroid: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID,
    revenuecatApiKeyIos: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
    revenuecatApiKeyAndroid: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY,
    sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  },
});
