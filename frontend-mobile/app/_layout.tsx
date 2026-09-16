/**
 * Root layout — providers (Query, Theme, Auth, i18n), fonts, splash, error boundary.
 */

import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { View, Text, Pressable } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import { Colors } from '../constants/colors';
import { useOfflineSync } from '../hooks/useOfflineSync';
import { loadStoredLanguage } from '../lib/i18n';
import { initSentry } from '../lib/sentry';
import '../lib/i18n';

initSentry();
SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 24 * 60 * 60 * 1000,
      retry: (failureCount, error: any) => {
        if (error?.status >= 400 && error?.status < 500) return false;
        return failureCount < 2;
      },
      networkMode: 'offlineFirst',
    },
    mutations: {
      retry: 0,
      networkMode: 'offlineFirst',
    },
  },
});

// Inline ErrorBoundary so a render error anywhere in the tree doesn't take
// down the whole app — the user gets a "Reload" button instead of a white
// screen. Logs to console; plug Sentry in componentDidCatch if/when wired.
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: '#000',
            padding: 20,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 18, marginBottom: 10 }}>
            Something went wrong
          </Text>
          <Text
            style={{
              color: '#999',
              marginBottom: 20,
              textAlign: 'center',
            }}
            numberOfLines={4}
          >
            {this.state.error?.message}
          </Text>
          <Pressable
            onPress={() => this.setState({ hasError: false, error: null })}
            accessibilityRole="button"
            accessibilityLabel="Reload"
          >
            <Text style={{ color: '#FFD700', fontSize: 16 }}>
              Reload
            </Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function RootLayout() {
  const { status, pendingCount } = useOfflineSync();

  useEffect(() => {
    async function prepare() {
      try {
        // Apply stored language on cold start so Arabic users see the correct
        // locale AND RTL layout from first frame, instead of needing an app
        // restart after the language picker runs I18nManager.forceRTL.
        await loadStoredLanguage();
        await Font.loadAsync({
          'Inter-Regular': require('../assets/fonts/Inter-Regular.ttf'),
          'Inter-Medium': require('../assets/fonts/Inter-Medium.ttf'),
          'Inter-SemiBold': require('../assets/fonts/Inter-SemiBold.ttf'),
          'Inter-Bold': require('../assets/fonts/Inter-Bold.ttf'),
          'NotoNaskhArabic-Regular': require('../assets/fonts/NotoNaskhArabic-Regular.ttf'),
          'NotoNaskhArabic-Bold': require('../assets/fonts/NotoNaskhArabic-Bold.ttf'),
        });
      } catch (e) {
        if (__DEV__) console.warn('Font load failed, using system fallback', e);
      }
      await SplashScreen.hideAsync().catch(() => {});
    }
    prepare();
  }, []);

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <StatusBar style="light" backgroundColor={Colors.background} />
            <View style={{ flex: 1 }}>
              {status === 'offline' || pendingCount > 0 ? (
                <View
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    backgroundColor: status === 'offline' ? '#f59e0b' : '#3b82f6',
                    padding: 4,
                    zIndex: 999,
                  }}
                >
                  <Text style={{ color: '#fff', textAlign: 'center', fontSize: 12 }}>
                    {status === 'offline' ? '📡 Offline' : '🔄 Syncing'} ({pendingCount})
                  </Text>
                </View>
              ) : null}
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: Colors.background },
                  animation: Platform.OS === 'ios' ? 'default' : 'fade',
                }}
              >
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="(auth)" options={{ headerShown: false }} />
                <Stack.Screen name="lesson/[id]" options={{ headerShown: false, presentation: 'card' }} />
                <Stack.Screen name="ask" options={{ presentation: 'modal' }} />
                <Stack.Screen name="upload" options={{ presentation: 'modal' }} />
                <Stack.Screen name="+not-found" />
              </Stack>
            </View>
          </QueryClientProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
