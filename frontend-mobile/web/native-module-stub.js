/**
 * Web stub for native modules that don't have a web implementation.
 * Returns no-op functions that satisfy the API surface so the web build
 * can succeed. The real native modules are loaded on iOS/Android.
 */

// expo-secure-store
const memoryStore = new Map();
const SecureStore = {
  async getItemAsync(key) {
    try { return localStorage.getItem(key); } catch { return memoryStore.get(key) ?? null; }
  },
  async setItemAsync(key, value) {
    try { localStorage.setItem(key, value); } catch { memoryStore.set(key, value); }
  },
  async deleteItemAsync(key) {
    try { localStorage.removeItem(key); } catch { memoryStore.delete(key); }
  },
};

// expo-sqlite
const SQLite = {
  async openDatabaseAsync() {
    return {
      execAsync: async () => {},
      runAsync: async () => {},
      getFirstAsync: async () => null,
      getAllAsync: async () => [],
    };
  },
};

// expo-blur
const BlurView = () => null;

// expo-haptics
const Haptics = {
  impactAsync: async () => {},
  notificationAsync: async () => {},
  selectionAsync: async () => {},
};

// expo-notifications
const Notifications = {
  setNotificationHandler: () => {},
  getPermissionsAsync: async () => ({ status: 'denied' }),
  requestPermissionsAsync: async () => ({ status: 'denied' }),
  getExpoPushTokenAsync: async () => ({ data: 'web-mock-token' }),
  scheduleNotificationAsync: async () => 'web-mock-id',
};

// expo-image-picker
const ImagePicker = {
  MediaTypeOptions: { Images: 'images' },
  requestCameraPermissionsAsync: async () => ({ status: 'denied' }),
  requestMediaLibraryPermissionsAsync: async () => ({ status: 'denied' }),
  launchCameraAsync: async () => ({ canceled: true }),
  launchImageLibraryAsync: async () => ({ canceled: true }),
};

// expo-document-picker
const DocumentPicker = {
  getDocumentAsync: async () => ({ canceled: true }),
};

// expo-local-authentication
const LocalAuthentication = {
  hasHardwareAsync: async () => false,
  isEnrolledAsync: async () => false,
  authenticateAsync: async () => ({ success: false }),
};

// expo-task-manager / expo-background-fetch
const TaskManager = {};
const BackgroundFetch = {};

// expo-network
const Network = {};

// expo-web-browser
const WebBrowser = { maybeCompleteAuthSession: () => {} };

// expo-clipboard
const Clipboard = {
  setStringAsync: async () => {},
  getStringAsync: async () => '',
};

// expo-auth-session
const AuthSession = {
  makeRedirectUri: () => 'http://localhost:19006/oauth',
  generateRandom: () => 'mock-random-state',
  startAsync: async () => ({ type: 'cancel' }),
  useAuthRequest: () => [null, { type: 'idle' }, async () => ({ type: 'cancel' })],
};

// expo-crypto
const Crypto = {
  randomUUID: () => Math.random().toString(36).slice(2) + Date.now().toString(36),
  digestStringAsync: async () => 'mock-digest',
  CryptoDigestAlgorithm: { SHA256: 'SHA256' },
  CryptoEncoding: { BASE64: 'base64' },
};

// expo-font
const Font = {
  loadAsync: async () => {},
  isLoaded: () => false,
};

// expo-asset
const Asset = { fromModule: () => ({}) };

// expo-constants
const Constants = { expoConfig: { extra: { apiBase: 'http://localhost:8000' } } };

// expo-linking
const Linking = {};

// expo-splash-screen
const SplashScreen = {
  preventAutoHideAsync: async () => {},
  hideAsync: async () => {},
};

// expo-router
const Stack = () => null;
const Tabs = () => null;
const Link = () => null;
const useRouter = () => ({ push: () => {}, replace: () => {}, back: () => {} });
const useLocalSearchParams = () => ({});
const useGlobalSearchParams = () => ({});
const usePathname = () => '/';
const useSegments = () => [];
const useFocusEffect = () => {};
const Slot = () => null;
const StackScreen = () => null;
const Redirect = () => null;
const SplashScreen2 = () => null;
const ErrorBoundary = ({ children }) => children;
const router = { push: () => {}, replace: () => {}, back: () => {} };
const StackActions = {};

const expo = {
  router: {
    push: () => {}, replace: () => {}, back: () => {},
    navigate: () => {},
  },
};

module.exports = {
  SecureStore,
  SQLite,
  BlurView,
  Haptics,
  Notifications,
  ImagePicker,
  DocumentPicker,
  LocalAuthentication,
  TaskManager,
  BackgroundFetch,
  Network,
  WebBrowser,
  Clipboard,
  AuthSession,
  Crypto,
  Font,
  Asset,
  Constants,
  Linking,
  SplashScreen,
  // expo-router exports
  Stack,
  Tabs,
  Link,
  useRouter,
  useLocalSearchParams,
  useGlobalSearchParams,
  usePathname,
  useSegments,
  useFocusEffect,
  Slot,
  StackScreen,
  Redirect,
  ErrorBoundary,
  router,
  StackActions,
  expo,
  // Default
  default: { router: { push: () => {}, replace: () => {}, back: () => {} } },
};
