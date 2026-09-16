/**
 * OAuth callback — handles deep link return from Google.
 */

import { useEffect } from 'react';
import { Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { Spacing } from '../../constants/spacing';
import { useAuth } from '../../hooks/useAuth';

export default function OAuthCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { exchangeCode, validateCallback } = useAuth();

  useEffect(() => {
    const handleCallback = async () => {
      // useLocalSearchParams can return string | string[] depending on how
      // the deep link was built. Normalize before use so downstream calls
      // (validateCallback, exchangeCode) always get a single string.
      const code = Array.isArray(params.code) ? params.code[0] : params.code;
      const state = Array.isArray(params.state) ? params.state[0] : params.state;
      const error = Array.isArray(params.error) ? params.error[0] : params.error;

      if (error) {
        // SECURITY: the OAuth error string can include the auth code, redirect
        // URI or other sensitive params echoed back by the provider. Log a
        // redacted placeholder so we don't leak them to the dev console.
        if (__DEV__) console.error('OAuth callback error: [redacted]');
        router.replace(`/(auth)/signin?error=${encodeURIComponent(error)}`);
        return;
      }

      if (!code || !state) {
        router.replace('/(auth)/signin?error=missing_code_or_state');
        return;
      }

      try {
        const isValid = await validateCallback(state);
        if (!isValid) {
          router.replace('/(auth)/signin?error=state_mismatch');
          return;
        }
        await exchangeCode(code, state);
        router.replace('/(tabs)');
      } catch (e: any) {
        // SECURITY: e may contain the OAuth `code` or `error_description`
        // echoed from the provider. Redact when those keys are present.
        if (__DEV__) console.error('OAuth callback failed:', e?.code ? '[redacted]' : e);
        const reason = e?.message ? 'exchange_failed' : 'unknown';
        router.replace(`/(auth)/signin?error=${encodeURIComponent(reason)}`);
      }
    };
    handleCallback();
  }, [params, exchangeCode, validateCallback, router]);

  return (
    <SafeAreaView style={styles.container}>
      <ActivityIndicator size="large" color={Colors.gold.metallic} />
      <Text style={[Typography.bodyMedium, styles.text]}>Completing sign-in...</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[4],
  },
  text: {
    color: Colors.text.secondary,
  },
});
