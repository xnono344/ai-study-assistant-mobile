/**
 * Sign-in screen — Google OAuth + anonymous continue.
 * Fully translated (EN/FR/AR).
 */

import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { Shield } from 'lucide-react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { NexusLogo } from '../../components/ui/NexusLogo';
import { GlassButton } from '../../components/ui/GlassButton';
import { GlassCard } from '../../components/ui/GlassCard';
import { useAuth } from '../../hooks/useAuth';
import { useT } from '../../hooks/useT';
import { getErrorMessage } from '../../lib/api';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { Spacing } from '../../constants/spacing';

WebBrowser.maybeCompleteAuthSession();

export default function SignInScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ error?: string | string[] }>();
  const { t } = useT();
  const { signInWithGoogle, continueAnonymously, isLoading, error: authError } = useAuth();
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isAnonymousLoading, setIsAnonymousLoading] = useState(false);
  // SECURITY: surface either the local action error OR the auth context error
  // so the error card updates reactively after a sign-in attempt. The OAuth
  // callback can also redirect back here with `?error=...` — map known
  // reasons to a translated message; everything else falls back to generic.
  const [localError, setLocalError] = useState<string | null>(null);
  // useLocalSearchParams can return string | string[]. Normalize so the
  // translation key is always built from a single string.
  const errorParam = Array.isArray(params.error) ? params.error[0] : params.error;
  const oauthError = errorParam
    ? t(`errors.oauth.${errorParam}`, { defaultValue: t('errors.generic') })
    : null;
  const displayError = oauthError || localError || authError;

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    setLocalError(null);
    try {
      await signInWithGoogle();
      router.replace('/(tabs)');
    } catch (e: any) {
      if (__DEV__) console.error('Google sign-in failed', e);
      const { message } = getErrorMessage(e);
      setLocalError(t(message));
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleAnonymous = async () => {
    setIsAnonymousLoading(true);
    setLocalError(null);
    try {
      await continueAnonymously();
      router.replace('/(tabs)');
    } catch (e: any) {
      if (__DEV__) console.error('Anonymous session failed', e);
      const { message } = getErrorMessage(e);
      setLocalError(t(message));
    } finally {
      setIsAnonymousLoading(false);
    }
  };

  const features = [
    { icon: '✨', titleKey: 'dashboard.totalLessons' as const, descKey: 'common.poweredByYou' as const },
    { icon: '📚', titleKey: 'lessons.title' as const, descKey: 'auth.connectGoogleSubtitle' as const },
    { icon: '🌍', titleKey: 'settings.language' as const, descKey: 'auth.featuresSubtitle' as const },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Animated.View entering={FadeIn.duration(600)} style={styles.content}>
        <View style={styles.logoSection}>
          <NexusLogo size={96} showWordmark />
          <Text style={[Typography.bodyMedium, styles.tagline]}>
            {t('common.tagline')}
          </Text>
        </View>

        <View style={styles.features}>
          {features.map((f, i) => (
            <View key={i} style={styles.featureRow}>
              <Text style={styles.featureIcon}>{f.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[Typography.bodyMedium, { color: '#FFFFFF' }]}>
                  {t(f.titleKey)}
                </Text>
                <Text style={[Typography.bodySmall, { color: Colors.text.tertiary }]}>
                  {t(f.descKey)}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.actions}>
          <GlassButton
            variant="primary"
            onPress={handleGoogleSignIn}
            loading={isGoogleLoading}
            disabled={isLoading}
            fullWidth
            size="lg"
            icon={
              <View style={styles.googleIcon}>
                <Text style={styles.googleG}>G</Text>
              </View>
            }
            accessibilityLabel={t('auth.continueWithGoogle')}
            accessibilityHint={t('auth.connectGoogleSubtitle')}
          >
            {t('auth.continueWithGoogle')}
          </GlassButton>

          <Pressable
            onPress={handleAnonymous}
            disabled={isLoading}
            style={({ pressed }) => [styles.anonymousBtn, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel={t('auth.continueWithoutAccount')}
          >
            {isAnonymousLoading ? (
              <ActivityIndicator color={Colors.text.tertiary} />
            ) : (
              <Text style={styles.anonymousText}>
                {t('auth.continueWithoutAccount')}
              </Text>
            )}
          </Pressable>
        </View>

        {displayError && (
          <GlassCard variant="error" style={styles.errorCard}>
            <Text style={[Typography.bodySmall, { color: Colors.error }]}>
              {displayError}
            </Text>
          </GlassCard>
        )}

        <View style={styles.legal}>
          <Pressable
            onPress={() => router.push('/(auth)/legal')}
            accessibilityRole="link"
            accessibilityLabel={`${t('auth.legal.termsOfService')} ${t('auth.legal.termsAnd')} ${t('auth.legal.privacyPolicy')}`}
          >
            <Text style={styles.legalText}>
              {t('auth.legal.consentText')}{' '}
              <Text style={styles.legalLink}>{t('auth.legal.termsOfService')}</Text>{' '}
              {t('auth.legal.termsAnd')}{' '}
              <Text style={styles.legalLink}>{t('auth.legal.privacyPolicy')}</Text>
            </Text>
          </Pressable>
          <View style={styles.trustRow}>
            <Shield size={12} color={Colors.text.tertiary} />
            <Text style={styles.trustText}>{t('auth.legal.trustBadge')}</Text>
          </View>
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing[6],
    paddingTop: Spacing[8],
    paddingBottom: Spacing[6],
    justifyContent: 'space-between',
  },
  logoSection: {
    alignItems: 'center',
    marginTop: Spacing[8],
  },
  tagline: {
    marginTop: Spacing[3],
    color: Colors.text.tertiary,
  },
  features: {
    gap: Spacing[4],
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
  },
  featureIcon: {
    fontSize: 28,
  },
  actions: {
    gap: Spacing[3],
  },
  googleIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleG: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4285F4',
  },
  anonymousBtn: {
    paddingVertical: Spacing[4],
    alignItems: 'center',
  },
  anonymousText: {
    color: Colors.text.tertiary,
    fontSize: 14,
  },
  errorCard: {
    padding: Spacing[3],
  },
  legal: {
    alignItems: 'center',
    gap: Spacing[2],
  },
  legalText: {
    color: Colors.text.tertiary,
    fontSize: 12,
    textAlign: 'center',
  },
  legalLink: {
    color: Colors.text.secondary,
    textDecorationLine: 'underline',
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  trustText: {
    color: Colors.text.tertiary,
    fontSize: 11,
  },
});
